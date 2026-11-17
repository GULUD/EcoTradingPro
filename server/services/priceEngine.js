const prisma = require('../db')

// Last executed trade is the reference price. manualPrice is only a fallback
// for markets that have never traded, so quotes cannot drift without fills.
function displayPrice(row) {
  if (row.price > 0) return row.price
  return row.manualPrice ?? 0
}

const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_REFRESH_MS = 60 * 1000

let openCache = new Map()
let volumeCache = new Map()
let openCacheAt = 0

// The 24h reference must roll forward or "change24h" silently becomes
// "change since the first fill"; the oldest fill inside the window is the open.
// Volume had the same problem: the stored counter only grew, so it reported
// lifetime volume under a 24h label.
async function refreshRolling(coins) {
  const since = BigInt(Date.now() - DAY_MS)
  const next = new Map()
  const volumes = new Map()
  const [firstRows, volumeRows] = await Promise.all([
    Promise.all(
      coins.map(async (coin) => {
        const first = await prisma.trade.findFirst({
          where: { symbol: coin.symbol, time: { gte: since } },
          orderBy: { time: 'asc' },
          select: { symbol: true, price: true },
        })
        return first
      })
    ),
    prisma.$queryRaw`
      SELECT symbol, SUM(size * price) AS volume
      FROM "Trade"
      WHERE time >= ${since}
      GROUP BY symbol`,
  ])
  for (const first of firstRows) {
    if (first && first.price > 0) next.set(first.symbol, first.price)
  }
  for (const row of volumeRows) {
    const volume = Number(row.volume)
    if (Number.isFinite(volume) && volume > 0) volumes.set(row.symbol, volume)
  }
  openCache = next
  volumeCache = volumes
  openCacheAt = Date.now()
}

// Price only moves when an order fills, so this tick keeps 24h change in sync
// with the last trade and broadcasts the snapshot.
async function tickPrices(io) {
  const coins = await prisma.marketData.findMany({ where: { delisted: false } })
  const now = Date.now()
  if (now - openCacheAt > OPEN_REFRESH_MS) await refreshRolling(coins)

  const changed = []
  for (const c of coins) {
    const price = displayPrice(c)
    if (!price) continue
    // Markets that did not trade in the window keep their stored reference
    const open = openCache.get(c.symbol) || c.open24h || price
    const change24h = +(((price - open) / open) * 100).toFixed(2)
    const volume24h = +(volumeCache.get(c.symbol) || 0).toFixed(8)
    if (change24h === c.change24h && open === c.open24h && volume24h === c.volume24h) continue
    await prisma.marketData.update({
      where: { symbol: c.symbol },
      data: { change24h, open24h: open, volume24h },
    })
    c.change24h = change24h
    c.open24h = open
    c.volume24h = volume24h
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
