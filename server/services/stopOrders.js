const prisma = require('../db')
const { executeOrder } = require('./matchingEngine')

// Stop orders are stored as open schedule rows and claimed atomically before
// firing, so two workers (or two ticks) can never execute the same schedule.
// Firing creates an ordinary order, which keeps the matching engine unchanged.
async function triggerStopOrders(io) {
  const stops = await prisma.order.findMany({
    where: { type: { in: ['stop_loss', 'stop_limit'] }, status: 'open' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  if (!stops.length) return

  const symbols = [...new Set(stops.map((o) => o.symbol))]
  const coins = await prisma.marketData.findMany({ where: { symbol: { in: symbols } } })
  // A delisted or unquoted market cannot trigger anything
  const prices = new Map(coins.filter((c) => !c.delisted).map((c) => [c.symbol, c.price > 0 ? c.price : c.manualPrice]))

  for (const stop of stops) {
    const last = prices.get(stop.symbol)
    if (!(last > 0) || !(stop.triggerPrice > 0)) continue

    // Buy stops activate on a rise, sell stops on a fall
    const hit = stop.side === 'buy' ? last >= stop.triggerPrice : last <= stop.triggerPrice
    if (!hit) continue

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

    if (io && stop.userId) {
      io.to(`user-${stop.userId}`).emit('order:update', { orderId: stop.id, status: 'triggered' })
    }
  }
}

module.exports = { triggerStopOrders }
