const prisma = require('../db')

// The venue itself posts resting quotes so a new market is tradable from day
// one. These orders carry house=true and never touch a user balance; fills are
// recorded as bot-sourced trades. Quotes follow the last trade.
const LEVELS = [0.0006, 0.0015, 0.003, 0.005, 0.008]
const NOTIONAL = 1500
const MAX_AGE_MS = 10 * 60 * 1000
const MAX_DRIFT = 0.02
const NEAR = 0.014

const r = (n, d) => +Number(n).toFixed(d)
const best = (rows, dir) => rows.reduce((m, o) => (m === 0 ? o.price : dir === 'max' ? Math.max(m, o.price) : Math.min(m, o.price)), 0)

async function cancelHouse(rows) {
  if (!rows.length) return
  await prisma.order.updateMany({
    where: { id: { in: rows.map((o) => o.id) }, status: { in: ['open', 'partial'] } },
    data: { status: 'canceled' },
  })
}

async function tick(io) {
  const coins = await prisma.marketData.findMany({ where: { delisted: false } })
  const touched = new Set()

  for (const c of coins) {
    const center = c.price > 0 ? c.price : c.manualPrice
    if (!center) continue

    // Only house quotes are reconciled here; a truncated mixed query made dedupe fail once books grew
    const house = await prisma.order.findMany({
      where: { symbol: c.symbol, house: true, status: { in: ['open', 'partial'] } },
    })
    const userBidRow = await prisma.order.findFirst({
      where: { symbol: c.symbol, house: false, side: 'buy', status: { in: ['open', 'partial'] } },
      orderBy: { price: 'desc' },
      select: { price: true },
    })
    const userAskRow = await prisma.order.findFirst({
      where: { symbol: c.symbol, house: false, side: 'sell', status: { in: ['open', 'partial'] } },
      orderBy: { price: 'asc' },
      select: { price: true },
    })
    const userBid = userBidRow ? userBidRow.price : 0
    const userAsk = userAskRow ? userAskRow.price : 0
    const bidLevels = house.filter((o) => o.side === 'buy').map((o) => o.price)
    const askLevels = house.filter((o) => o.side === 'sell').map((o) => o.price)
    if (userBid > 0) bidLevels.push(userBid)
    if (userAsk > 0) askLevels.push(userAsk)

    const now = Date.now()
    const stale = []
    let alive = []
    for (const o of house) {
      const drift = Math.abs(o.price - center) / center
      const age = now - o.createdAt.getTime()
      const remaining = o.size - o.filled
      if (drift > MAX_DRIFT || age > MAX_AGE_MS || remaining <= o.size * 0.15) stale.push(o)
      else alive.push(o)
    }

    // House quotes must never sit inside a user limit or cross each other
    const bid = bidLevels.length ? Math.max(...bidLevels) : 0
    const ask = askLevels.length ? Math.min(...askLevels) : 0
    const crossed = bid > 0 && ask > 0 && bid >= ask
    const bad = crossed
      ? house.filter((o) => (o.side === 'buy' && o.price >= ask) || (o.side === 'sell' && o.price <= bid))
      : []
    const drop = [...stale, ...bad]
    if (drop.length) {
      await cancelHouse(drop)
      const dropped = new Set(drop.map((o) => o.id))
      alive = alive.filter((o) => !dropped.has(o.id))
      touched.add(c.symbol)
    }

    const fresh = []
    for (const side of ['buy', 'sell']) {
      const near = alive.filter((o) => o.side === side && Math.abs(o.price - center) / center <= NEAR)
      const priced = new Set(near.map((o) => o.price))
      for (const offset of LEVELS) {
        const price = side === 'buy' ? r(center * (1 - offset), c.decimals) : r(center * (1 + offset), c.decimals)
        if (!(price > 0) || priced.has(price)) continue
        if (side === 'buy' && userAsk > 0 && price >= userAsk) continue
        if (side === 'sell' && userBid > 0 && price <= userBid) continue
        const notional = NOTIONAL * (0.6 + Math.random() * 0.8)
        const size = r(notional / price, Math.min(8, c.decimals + 2))
        if (!(size > 0)) continue
        fresh.push({ symbol: c.symbol, side, type: 'limit', price, size, house: true, status: 'open' })
      }
    }

    // One batch insert keeps the maker from holding the database for long stretches
    if (fresh.length) {
      await prisma.order.createMany({ data: fresh })
      touched.add(c.symbol)
    }
  }

  if (io && touched.size) {
    for (const symbol of touched) io.to('market').emit('orderbook:update', { symbol })
  }
}

module.exports = { tick }
