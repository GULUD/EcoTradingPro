const prisma = require('../db')

// Last executed trade is the reference price. manualPrice is only a fallback
// for markets that have never traded, so quotes cannot drift without fills.
function displayPrice(row) {
  if (row.price > 0) return row.price
  return row.manualPrice ?? 0
}

// Price only moves when an order fills, so this tick just keeps 24h change in
// sync with the last trade and broadcasts the snapshot.
async function tickPrices(io) {
  const coins = await prisma.marketData.findMany({ where: { delisted: false } })
  const now = Date.now()
  const changed = []

  for (const c of coins) {
    const price = displayPrice(c)
    if (!price) continue
    const open = c.open24h || price
    const change24h = +(((price - open) / open) * 100).toFixed(2)
    if (change24h === c.change24h) continue
    await prisma.marketData.update({ where: { symbol: c.symbol }, data: { change24h } })
    changed.push({ symbol: c.symbol, price, change24h })
  }

  if (!changed.length) return

  const rows = await prisma.marketData.findMany({ where: { delisted: false }, orderBy: { symbol: 'asc' } })
  const prices = rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    price: displayPrice(r),
    change24h: r.change24h,
    volume24h: r.volume24h,
    current_price: displayPrice(r),
    decimals: r.decimals,
    updatedAt: now,
  }))

  if (io) io.to('market').emit('price:update', { prices, timestamp: now })
}

module.exports = { tickPrices, displayPrice }
