const prisma = require('../db')

// Single read point for the price: admin anchor wins, timer drift never overwrites it
function displayPrice(row) {
  return row.manualPrice ?? row.price
}

async function tickPrices(io) {
  const coins = await prisma.marketData.findMany({ where: { delisted: false } })
  const now = Date.now()
  const updates = []

  for (const c of coins) {
    const anchor = c.manualPrice ?? c.price
    if (!anchor) continue

    let next = anchor
    if (c.manualPrice != null) {
      const amp = c.volatility / 100
      next = +(anchor + (Math.random() - 0.5) * 2 * amp * anchor).toFixed(c.decimals)
    } else if (c.autoSync) {
      const drift = ((Math.random() - 0.5) * c.volatility) / 100
      next = +(anchor * (1 + drift)).toFixed(c.decimals)
    }
    // autoSync=false and manualPrice=null means the coin is frozen on purpose
    if (next === anchor && c.open24h === 0) continue

    const open = c.open24h || next
    const change24h = +(((next - open) / open) * 100).toFixed(2)
    await prisma.marketData.update({
      where: { symbol: c.symbol },
      data: { price: next, open24h: open, change24h },
    })
    updates.push({ symbol: c.symbol, price: next, change24h })
  }

  if (!updates.length) return
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
