const prisma = require('../db')
const { displayPrice } = require('./priceEngine')

// Alerts used to be stored and never evaluated, so users set targets that could
// never fire. One sweep per minute is enough for a price-level notification.
async function checkPriceAlerts(io) {
  const rows = await prisma.$queryRaw`
    SELECT id, "priceAlerts"
    FROM "User"
    WHERE "isActive" = true AND jsonb_array_length("priceAlerts") > 0
    LIMIT 500`

  if (!rows.length) return

  const coins = await prisma.marketData.findMany({ where: { delisted: false } })
  const prices = {}
  for (const coin of coins) prices[coin.symbol] = displayPrice(coin)

  for (const row of rows) {
    const alerts = Array.isArray(row.priceAlerts) ? row.priceAlerts : []
    const hits = new Map()
    for (const alert of alerts) {
      if (alert.status !== 'active') continue
      const price = prices[alert.asset]
      const target = Number(alert.price)
      if (!(price > 0) || !(target > 0)) continue
      const reached = alert.type === 'above' ? price >= target : price <= target
      if (reached) hits.set(alert.id, price)
    }
    if (!hits.size) continue

    // Re-read before writing so an alert created since the snapshot is kept
    const fresh = await prisma.user.findUnique({ where: { id: row.id }, select: { priceAlerts: true } })
    const current = Array.isArray(fresh?.priceAlerts) ? fresh.priceAlerts : []
    let changed = false
    const next = current.map((alert) => {
      if (alert.status !== 'active' || !hits.has(alert.id)) return alert
      changed = true
      const price = hits.get(alert.id)
      if (io) {
        io.to(`user-${row.id}`).emit('notification', {
          id: `alert-${alert.id}`,
          type: 'price',
          title: `${alert.asset} price alert`,
          message: `${alert.asset} reached ${price} GULU (${alert.type} ${alert.price})`,
          timestamp: Date.now(),
        })
      }
      return { ...alert, status: 'triggered', triggeredAt: new Date().toISOString(), triggeredPrice: price }
    })

    if (changed) await prisma.user.update({ where: { id: row.id }, data: { priceAlerts: next } })
  }
}

module.exports = { checkPriceAlerts }
