const prisma = require('../db')
const { executeOrder } = require('./matchingEngine')

const STALE_MS = 5 * 60 * 1000

// Stop orders are stored as open schedule rows and claimed atomically before
// firing, so two workers (or two ticks) can never execute the same schedule.
// Firing creates an ordinary order, which keeps the matching engine unchanged.
async function triggerStopOrders(io) {
  // A worker can die between claiming and executing; such rows would otherwise
  // stay "triggered" forever and never trade. Cancel them after a grace period.
  await prisma.order.updateMany({
    where: {
      status: 'triggered',
      type: { in: ['stop_loss', 'stop_limit'] },
      updatedAt: { lt: new Date(Date.now() - STALE_MS) },
    },
    data: { status: 'canceled' },
  })

  // Filter by the trigger condition inside the database. Taking the oldest N rows
  // first let dormant stops starve every newer one, which silently disabled them.
  const hits = await prisma.$queryRaw`
    SELECT o.id
    FROM "Order" o
    JOIN "MarketData" m ON m.symbol = o.symbol
    WHERE o.type IN ('stop_loss'::"OrderType", 'stop_limit'::"OrderType")
      AND o.status = 'open'::"OrderStatus"
      AND m.delisted = false
      AND o."triggerPrice" > 0
      AND (
        (o.side = 'buy'::"Side" AND COALESCE(NULLIF(m.price, 0), m."manualPrice") >= o."triggerPrice")
        OR
        (o.side = 'sell'::"Side" AND COALESCE(NULLIF(m.price, 0), m."manualPrice") <= o."triggerPrice")
      )
    ORDER BY o."createdAt" ASC
    LIMIT 50`

  if (!hits.length) return
  const ids = hits.map((r) => r.id)
  const stops = await prisma.order.findMany({ where: { id: { in: ids }, status: 'open' } })

  for (const stop of stops) {
    // Infinity or NaN cannot describe a price; drop the schedule instead of firing it
    if (!Number.isFinite(stop.triggerPrice) || stop.triggerPrice <= 0) {
      await prisma.order.update({ where: { id: stop.id }, data: { status: 'canceled' } })
      continue
    }

    const claimed = await prisma.order.updateMany({
      where: { id: stop.id, status: 'open' },
      data: { status: 'triggered' },
    })
    if (!claimed.count) continue

    try {
      await executeOrder(
        {
          userId: stop.userId,
          symbol: stop.symbol,
          side: stop.side,
          type: stop.type === 'stop_limit' ? 'limit' : 'market',
          price: stop.type === 'stop_limit' ? stop.price : undefined,
          // Limits are sized in quote for buys; stop schedules are always sized in base units
          amount: stop.type === 'stop_limit' && stop.side === 'buy' ? stop.size * stop.price : null,
          size: stop.size,
          // The trigger already moved the market; the placement-time band no longer applies
          allowFarPrice: true,
        },
        io
      )
    } catch (e) {
      // Funds or holdings moved away while the order was armed. Cancel instead of
      // retrying forever, and let the owner know through the socket.
      await prisma.order.update({ where: { id: stop.id }, data: { status: 'canceled' } })
      console.error('[stops] fire failed:', stop.symbol, stop.id, e.message)
      if (io && stop.userId) {
        io.to(`user-${stop.userId}`).emit('order:update', {
          orderId: stop.id,
          status: 'canceled',
          reason: e.message,
        })
      }
      continue
    }

    // The schedule fired; without a terminal status the stale sweep would later
    // cancel a stop that actually executed and the history would be misleading
    await prisma.order.update({ where: { id: stop.id }, data: { status: 'filled' } })

    if (io && stop.userId) {
      io.to(`user-${stop.userId}`).emit('order:update', { orderId: stop.id, status: 'filled' })
    }
  }
}

module.exports = { triggerStopOrders }
