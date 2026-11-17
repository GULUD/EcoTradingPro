const prisma = require('../db')
const { Prisma } = require('@prisma/client')

// Taker and maker both pay 0.1%. Buys are charged in the received asset,
// sells in the received quote, which keeps settlement to a single credit.
const FEE_RATE = 0.001
const EPS = 1e-9
const MAX_RETRIES = 3
const MAX_LEVELS = 200

class TradeError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const r8 = (n) => +Number(n).toFixed(8)

const opposite = (side) => (side === 'buy' ? 'sell' : 'buy')

function orderDto(o) {
  const remaining = r8(o.size - o.filled)
  const legacyStatus =
    o.status === 'filled'
      ? 'completed'
      : o.status === 'canceled'
        ? 'cancelled'
        : o.status === 'open'
          ? 'pending'
          : o.status === 'triggered'
            ? 'triggered'
            : 'partial'
  return {
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    price: o.price,
    size: o.size,
    filled: o.filled,
    remaining,
    status: o.status,
    triggerPrice: o.triggerPrice ?? null,
    createdAt: o.createdAt.getTime(),
    updatedAt: o.updatedAt.getTime(),
    // legacy field names still read by OrderHistory and the trading panel
    asset: o.symbol,
    quantity: o.size,
    amount: r8(o.size * o.price),
    orderType: o.type,
    timestamp: o.createdAt.getTime(),
    statusLabel: legacyStatus,
  }
}

async function bestPrice(symbol, side) {
  const rows = await prisma.order.findMany({
    // Stop orders are dormant schedules, not liquidity
    where: { symbol, side, type: 'limit', status: { in: ['open', 'partial'] } },
    orderBy: { price: side === 'buy' ? 'desc' : 'asc' },
    take: 1,
  })
  return rows[0] ? rows[0].price : null
}

// Opens the opposing side of the book. Resting orders are locked row by row so
// two takers can never consume the same order twice.
const MARKET_SLIPPAGE = 0.01

async function executeOrder({ userId, symbol, side, type, price, amount, size, allowFarPrice = false }, io) {
  const coin = await prisma.marketData.findUnique({ where: { symbol } })
  if (!coin || coin.delisted) throw new TradeError('market not available')

  const best = await bestPrice(symbol, opposite(side))
  if (type === 'market' && (!best || !(best > 0))) {
    throw new TradeError('no resting liquidity for a market order right now')
  }

  if (type === 'limit' && !(price > 0)) throw new TradeError('limit price required')

  // Two self-dealt accounts could otherwise print any price and move the market reference.
  // Anchor on the last traded price; manualPrice is only a fallback before the first fill.
  if (type === 'limit' && !allowFarPrice) {
    const reference = coin.price > 0 ? coin.price : coin.manualPrice
    if (reference > 0 && Math.abs(price / reference - 1) > 0.2) {
      throw new TradeError('limit price is too far from the market price')
    }
  }

  // Market orders are sized against their worst allowed price, so a slightly
  // moved book still fills instead of failing on an empty top level
  const worst =
    type === 'limit' ? +price : side === 'buy' ? +best * (1 + MARKET_SLIPPAGE) : +best * (1 - MARKET_SLIPPAGE)
  const refPrice = type === 'limit' ? +price : +best
  if (!Number.isFinite(worst) || worst <= 0) throw new TradeError('invalid price')

  let qty
  if (side === 'buy') {
    if (amount != null) {
      const quote = +amount
      if (!Number.isFinite(quote) || quote <= 0) throw new TradeError('quote amount required')
      qty = r8(quote / worst)
    } else if (size != null) {
      // Stop orders carry a base quantity so the triggered trade matches the schedule
      qty = r8(+size)
    } else {
      throw new TradeError('quote amount required')
    }
  } else {
    qty = r8(size != null ? +size : +amount)
  }
  if (!(qty > 0) || qty > 1e9) throw new TradeError('invalid order size')

  // A market order never pays worse than its slippage bound
  const protection = type === 'market' ? worst : null

  const attempt = () =>
    prisma.$transaction(async (tx) => {
      // Row locks instead of serializable isolation: the liquidity engine writes
      // constantly, and serialization would abort almost every match.
      const locked = await tx.$queryRaw`
        SELECT id FROM "Order"
        WHERE symbol = ${symbol}
          AND side = ${opposite(side)}::"Side"
          AND type = 'limit'::"OrderType"
          AND status IN ('open'::"OrderStatus", 'partial'::"OrderStatus")
          ${type === 'limit' ? (side === 'buy' ? Prisma.sql`AND price <= ${refPrice}` : Prisma.sql`AND price >= ${refPrice}`) : Prisma.empty}
        ORDER BY price ${side === 'buy' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, "createdAt" ASC
        LIMIT ${MAX_LEVELS}
        FOR UPDATE`

      const levelIds = locked.map((r) => r.id)
      const levels = levelIds.length
        ? await tx.order.findMany({
            where: { id: { in: levelIds } },
            orderBy: [{ price: side === 'buy' ? 'asc' : 'desc' }, { createdAt: 'asc' }],
          })
        : []

      const userIds = [...new Set([userId, ...levels.map((o) => o.userId).filter(Boolean)])].sort()
      const users = await tx.$queryRaw`
        SELECT id FROM "User" WHERE id = ANY(${userIds}::text[]) ORDER BY id FOR UPDATE`
      if (users.length !== userIds.length) throw new TradeError('account not found', 409)

      const rows = await tx.user.findMany({ where: { id: { in: userIds } } })
      const source = new Map(rows.map((u) => [u.id, u]))
      const user = source.get(userId)
      if (!user) throw new TradeError('user not found', 401)

      const accounts = new Map()
      const account = async (id) => {
        if (!accounts.has(id)) {
          const u = source.get(id)
          if (!u) throw new TradeError('counterparty account missing', 409)
          accounts.set(id, {
            id,
            before: u.balance,
            balance: u.balance,
            portfolio: { ...(u.portfolio || {}) },
          })
        }
        return accounts.get(id)
      }

      const taker = await account(user.id)

      // Lock the taker's side of the trade up front, mirroring exchange holds
      if (side === 'buy') {
        const hold = r8(qty * worst)
        if (taker.balance + EPS < hold) throw new TradeError('insufficient balance')
        taker.balance = r8(taker.balance - hold)
      } else {
        const held = Number(taker.portfolio[symbol] || 0)
        if (held + EPS < qty) throw new TradeError('insufficient holdings')
        const left = r8(held - qty)
        if (left > 0) taker.portfolio[symbol] = left
        else delete taker.portfolio[symbol]
      }

      let remaining = qty
      let lastPrice = 0
      const fills = []
      const makerUpdates = []
      const tradeRows = []
      // House quotes have no account, so the GULU they pay or receive must be minted or burned
      let supplyDelta = 0

      for (const level of levels) {
        if (remaining <= EPS) break
        // Self-trade prevention: skip own resting orders
        if (level.userId && level.userId === userId) continue

        const avail = r8(level.size - level.filled)
        if (avail <= EPS) continue

        const px = level.price
        if (protection != null) {
          if (side === 'buy' && px > protection + EPS) break
          if (side === 'sell' && px < protection - EPS) break
        }

        const fillSize = remaining < avail ? remaining : avail

        const buyerId = side === 'buy' ? userId : level.userId
        const sellerId = side === 'buy' ? level.userId : userId

        if (buyerId) {
          const buyer = await account(buyerId)
          buyer.portfolio[symbol] = r8((Number(buyer.portfolio[symbol]) || 0) + fillSize * (1 - FEE_RATE))
          // The buyer held at the quoted price, so an improvement returns cash
          if (side === 'buy') {
            const improvement = (worst - px) * fillSize
            if (improvement > 0) buyer.balance = r8(buyer.balance + improvement)
          }
        }
        if (sellerId) {
          const seller = await account(sellerId)
          seller.balance = r8(seller.balance + fillSize * px * (1 - FEE_RATE))
        }

        // Keep issuance in step with balances: no counterparty account means no escrow existed
        const notional = fillSize * px
        if (side === 'buy') {
          if (level.userId) supplyDelta -= notional * FEE_RATE
          else supplyDelta -= notional
        } else if (level.userId) {
          supplyDelta -= notional * FEE_RATE
        } else {
          supplyDelta += notional * (1 - FEE_RATE)
        }

        makerUpdates.push({ id: level.id, filled: r8(level.filled + fillSize), size: level.size })
        tradeRows.push({ userId, side, size: fillSize, price: px })
        if (level.userId && level.userId !== userId) {
          tradeRows.push({ userId: level.userId, side: opposite(side), size: fillSize, price: px })
        }

        fills.push({ price: px, size: fillSize })
        lastPrice = px
        remaining = r8(remaining - fillSize)
      }

      for (const m of makerUpdates) {
        const done = m.filled >= m.size - EPS
        await tx.order.update({
          where: { id: m.id },
          data: { filled: m.filled, status: done ? 'filled' : 'partial' },
        })
      }

      const filled = r8(qty - remaining)
      const status =
        remaining <= EPS ? 'filled' : type === 'market' ? 'canceled' : filled > 0 ? 'partial' : 'open'

      // Unfilled market quantity is never left resting; release what was held (hold used worst, so refund the same basis)
      if (remaining > EPS && type === 'market') {
        if (side === 'buy') taker.balance = r8(taker.balance + remaining * worst)
        else taker.portfolio[symbol] = r8((Number(taker.portfolio[symbol]) || 0) + remaining)
      }

      const order = await tx.order.create({
        data: { userId, symbol, side, type, price: worst, size: qty, filled, status },
      })

      const now = BigInt(Date.now())
      if (tradeRows.length) {
        await tx.trade.createMany({
          data: tradeRows.map((t) => ({ userId: t.userId, symbol, side: t.side, size: t.size, price: t.price, pnl: 0, source: 'user', time: now })),
        })
      }

      // Single audit row per order so totalSupply always equals balances plus fees burned
      if (Math.abs(supplyDelta) > EPS) {
        await tx.guluIssue.create({
          data: {
            type: supplyDelta > 0 ? 'mint' : 'burn',
            amount: r8(Math.abs(supplyDelta)),
            userId,
            operator: 'system:market',
            note: `house fill ${symbol} ${side} ${filled}`,
            ts: now,
          },
        })
      }

      let volume = 0
      for (const f of fills) volume += f.size * f.price
      const volume24h = r8(volume)

      let change24h = coin.change24h
      if (fills.length) {
        const open = coin.open24h || lastPrice
        change24h = +(((lastPrice - open) / open) * 100).toFixed(2)
        await tx.marketData.update({
          where: { symbol },
          data: {
            price: lastPrice,
            open24h: open,
            change24h,
            volume24h: { increment: volume24h },
          },
        })
      }

      for (const acct of accounts.values()) {
        const delta = r8(acct.balance - acct.before)
        await tx.user.update({
          where: { id: acct.id },
          data: { balance: acct.balance, portfolio: acct.portfolio },
        })
        if (Math.abs(delta) > EPS) {
          await tx.transaction.create({
            data: {
              userId: acct.id,
              type: 'trade',
              amount: delta,
              balanceBefore: acct.before,
              balanceAfter: acct.balance,
              reason: `${side} ${filled} ${symbol} @ ${lastPrice || refPrice}`,
              ts: now,
            },
          })
        }
      }

      return {
        order,
        fills,
        lastPrice: lastPrice || refPrice,
        change24h,
        userIds: [...accounts.keys()],
        accounts: [...accounts.values()].map((a) => ({
          id: a.id,
          balance: a.balance,
          portfolio: a.portfolio,
        })),
      }
    }, { maxWait: 10000, timeout: 20000 })

  let result
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      result = await attempt()
      break
    } catch (e) {
      if (e.code === 'P2034' && i < MAX_RETRIES - 1) continue
      throw e
    }
  }

  if (io && result.fills.length) {
    io.to('market').emit('trade:executed', {
      symbol,
      side,
      size: result.order.filled,
      price: result.lastPrice,
      time: Date.now(),
    })
    io.to('market').emit('orderbook:update', { symbol })
    io.to('market').emit('price:update', {
      prices: [{ symbol, price: result.lastPrice, change24h: result.change24h }],
      timestamp: Date.now(),
    })
    for (const acct of result.accounts) {
      io.to(`user-${acct.id}`).emit('balance:update', {
        balance: acct.balance,
        portfolio: acct.portfolio,
      })
    }
  }

  return {
    order: orderDto(result.order),
    fills: result.fills,
    lastPrice: result.lastPrice,
    filled: result.order.filled,
    remaining: r8(result.order.size - result.order.filled),
    user: result.accounts.find((a) => a.id === userId),
  }
}

async function cancelOrder({ userId, orderId }, io) {
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      if (!locked.length) throw new TradeError('order not found', 404)
      const o = await tx.order.findUnique({ where: { id: orderId } })
      if (!o || o.userId !== userId) throw new TradeError('order not found', 404)
      if (o.status !== 'open' && o.status !== 'partial') throw new TradeError('order is not open')

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      const u = await tx.user.findUnique({ where: { id: userId } })
      if (!u) throw new TradeError('user not found', 404)

      const remaining = r8(o.size - o.filled)
      // Stop orders never locked funds, so cancelling one must not credit the account
      const isStop = o.type === 'stop_loss' || o.type === 'stop_limit'
      const portfolio = { ...(u.portfolio || {}) }
      let balance = u.balance
      if (!isStop && o.side === 'buy') {
        balance = r8(balance + remaining * o.price)
      } else if (!isStop && remaining > 0) {
        portfolio[o.symbol] = r8((Number(portfolio[o.symbol]) || 0) + remaining)
      }

      const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'canceled' } })
      await tx.user.update({ where: { id: userId }, data: { balance, portfolio } })

      return { order: updated, balance, portfolio }
    }, { maxWait: 10000, timeout: 20000 })

  let result
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      result = await attempt()
      break
    } catch (e) {
      if (e.code === 'P2034' && i < MAX_RETRIES - 1) continue
      throw e
    }
  }

  if (io) {
    io.to('market').emit('orderbook:update', { symbol: result.order.symbol })
    io.to(`user-${userId}`).emit('balance:update', {
      balance: result.balance,
      portfolio: result.portfolio,
    })
  }

  return { order: orderDto(result.order), balance: result.balance, portfolio: result.portfolio }
}

async function getOrderBook(symbol, depth = 20) {
  // Read each side from the top of the book; ordering by creation time truncated the best levels
  const take = Math.max(depth * 5, 200)
  const base = { symbol, type: 'limit', status: { in: ['open', 'partial'] } }
  const [bidRows, askRows] = await Promise.all([
    prisma.order.findMany({ where: { ...base, side: 'buy' }, orderBy: { price: 'desc' }, take }),
    prisma.order.findMany({ where: { ...base, side: 'sell' }, orderBy: { price: 'asc' }, take }),
  ])
  const rows = [...bidRows, ...askRows]

  const bids = new Map()
  const asks = new Map()
  for (const o of rows) {
    const size = r8(o.size - o.filled)
    if (size <= EPS) continue
    const book = o.side === 'buy' ? bids : asks
    book.set(o.price, r8((book.get(o.price) || 0) + size))
  }

  const build = (book, dir) => {
    const levels = [...book.entries()].sort((a, b) => (dir === 'desc' ? b[0] - a[0] : a[0] - b[0]))
    let total = 0
    return levels.slice(0, depth).map(([price, size]) => {
      total = r8(total + size)
      return { price, size, total }
    })
  }

  return { symbol, bids: build(bids, 'desc'), asks: build(asks, 'asc') }
}

async function getRecentTrades(symbol, limit = 40) {
  const rows = await prisma.trade.findMany({
    where: { symbol },
    orderBy: { time: 'desc' },
    take: limit,
  })
  return rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    price: t.price,
    size: t.size,
    time: Number(t.time),
  }))
}

const TF_MS = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
}
const TF_BUCKETS = {
  '1m': 120,
  '5m': 144,
  '15m': 96,
  '1h': 168,
  '4h': 120,
  '1d': 120,
  '1w': 52,
}

// Candles come from executed trades only. Empty buckets carry the previous
// close forward with zero volume instead of inventing price action.
async function buildCandles(symbol, timeframe) {
  const step = TF_MS[timeframe] || TF_MS['1h']
  const count = TF_BUCKETS[timeframe] || TF_BUCKETS['1h']
  const now = Date.now()
  const from = now - step * count

  const trades = await prisma.trade.findMany({
    where: { symbol, time: { gte: BigInt(from) } },
    // Newest first so a busy market keeps its recent candles; reversed below for charting
    orderBy: { time: 'desc' },
    take: 20000,
  })
  if (!trades.length) return []
  trades.reverse()

  const buckets = new Map()
  for (const t of trades) {
    const ts = Number(t.time)
    const key = Math.floor(ts / step) * step
    const b = buckets.get(key)
    if (!b) {
      buckets.set(key, { open: t.price, high: t.price, low: t.price, close: t.price, volume: t.size * t.price })
    } else {
      b.high = Math.max(b.high, t.price)
      b.low = Math.min(b.low, t.price)
      b.close = t.price
      b.volume += t.size * t.price
    }
  }

  const start = Math.floor(from / step) * step
  const out = []
  let prevClose = null
  for (let ts = start; ts <= now; ts += step) {
    const b = buckets.get(ts)
    if (b) {
      out.push({ timestamp: ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: +b.volume.toFixed(2) })
      prevClose = b.close
    } else if (prevClose != null) {
      out.push({ timestamp: ts, open: prevClose, high: prevClose, low: prevClose, close: prevClose, volume: 0 })
    }
  }
  return out
}

module.exports = {
  FEE_RATE,
  TradeError,
  executeOrder,
  cancelOrder,
  getOrderBook,
  getRecentTrades,
  buildCandles,
  orderDto,
  bestPrice,
  r8,
}
