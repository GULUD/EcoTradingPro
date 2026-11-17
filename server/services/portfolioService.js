const prisma = require('../db')
const { FEE_RATE } = require('./matchingEngine')

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_REPLAY_TRADES = 20000

const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0)

// Average-cost replay over the user's own fills. Prices alone cannot describe
// performance: cost basis has to be rebuilt from the chronological trade log.
// Buys are credited net of the fee the engine actually delivered.
function replayTrades(trades) {
  const books = new Map()
  const pnlById = new Map()
  const sells = []
  let realized = 0

  for (const trade of trades) {
    const book = books.get(trade.symbol) || { qty: 0, cost: 0 }
    let pnl = 0

    if (trade.side === 'buy') {
      const received = trade.size * (1 - FEE_RATE)
      book.qty += received
      book.cost += trade.size * trade.price
    } else {
      const avgCost = book.qty > 1e-12 ? book.cost / book.qty : trade.price
      const costed = Math.min(trade.size, book.qty)
      const costOut = avgCost * costed
      const proceeds = trade.size * trade.price * (1 - FEE_RATE)
      pnl = proceeds - costOut
      realized += pnl
      book.qty = Math.max(0, book.qty - trade.size)
      book.cost = Math.max(0, book.cost - costOut)
      sells.push({
        id: trade.id,
        symbol: trade.symbol,
        time: Number(trade.time),
        size: trade.size,
        price: trade.price,
        pnl,
        costOut,
      })
    }

    if (pnl !== 0) pnlById.set(trade.id, pnl)
    books.set(trade.symbol, book)
  }

  return { books, pnlById, sells, realized }
}

// Holdings that were never bought through the matching engine (seeded or
// transferred in) carry no cost basis; valuing them at the current price keeps
// their unrealized result at zero instead of inventing profit.
function valueUnrealized(books, portfolio, prices) {
  let unrealized = 0
  let basis = 0
  for (const [asset, rawQty] of Object.entries(portfolio || {})) {
    const qty = Number(rawQty)
    if (!Number.isFinite(qty) || qty <= 1e-12) continue
    const price = Number(prices[asset]?.price) || 0
    const book = books.get(asset) || { qty: 0, cost: 0 }
    const tracked = Math.min(qty, book.qty)
    const unitCost = book.qty > 1e-12 ? book.cost / book.qty : price
    const knownBasis = tracked * unitCost
    const unknownBasis = (qty - tracked) * price
    unrealized += qty * price - knownBasis - unknownBasis
    basis += knownBasis + unknownBasis
  }
  return { unrealized, basis }
}

// Daily closes from real fills; returning null when a symbol has too few days
// is honest, whereas a constant 0 would read as a measured result.
async function returnsBySymbol(symbols, days = 30) {
  if (!symbols.length) return new Map()
  const from = BigInt(Date.now() - days * DAY_MS)
  const rows = await prisma.trade.findMany({
    where: { symbol: { in: symbols }, time: { gte: from } },
    orderBy: { time: 'asc' },
    select: { symbol: true, price: true, time: true },
  })

  const closes = new Map()
  for (const row of rows) {
    const day = Math.floor(Number(row.time) / DAY_MS)
    if (!closes.has(row.symbol)) closes.set(row.symbol, new Map())
    closes.get(row.symbol).set(day, row.price)
  }

  const series = new Map()
  for (const [symbol, byDay] of closes) {
    const daysSorted = [...byDay.keys()].sort((a, b) => a - b)
    const points = []
    for (let i = 1; i < daysSorted.length; i++) {
      const prev = byDay.get(daysSorted[i - 1])
      const cur = byDay.get(daysSorted[i])
      if (prev > 0 && cur > 0) points.push({ day: daysSorted[i], value: cur / prev - 1 })
    }
    if (points.length >= 2) series.set(symbol, points)
  }
  return series
}

const stdev = (values) => {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

const alignReturns = (a, b) => {
  const byDay = new Map(b.map((p) => [p.day, p.value]))
  return a.filter((p) => byDay.has(p.day)).map((p) => [p.value, byDay.get(p.day)])
}

const covariance = (pairs) => {
  if (pairs.length < 2) return null
  const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length
  const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length
  return pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (pairs.length - 1)
}

class PortfolioService {
  async loadPrices() {
    const coins = await prisma.marketData.findMany({ where: { delisted: false } })
    const map = {}
    for (const c of coins) {
      // Last traded price first; manualPrice is only an anchor before the first fill
      map[c.symbol] = { price: c.price > 0 ? c.price : c.manualPrice, change24h: c.change24h, volume24h: c.volume24h }
    }
    return map
  }

  async calculatePortfolioValue(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')

    const prices = await this.loadPrices()
    const portfolio = user.portfolio || {}
    let totalValue = user.balance || 0
    const holdings = []

    for (const [asset, quantity] of Object.entries(portfolio)) {
      if (quantity > 0) {
        const marketPrice = prices[asset]?.price || 0
        const value = quantity * marketPrice
        totalValue += value
        holdings.push({ asset, quantity, marketPrice, value, allocation: 0 })
      }
    }

    holdings.forEach((h) => {
      h.allocation = totalValue > 0 ? (h.value / totalValue) * 100 : 0
    })

    return {
      totalValue: +totalValue.toFixed(2),
      cashBalance: user.balance || 0,
      holdings,
      lastUpdated: new Date(),
    }
  }

  async loadReplay(userId) {
    const trades = await prisma.trade.findMany({
      where: { userId, source: 'user' },
      orderBy: [{ time: 'asc' }, { id: 'asc' }],
      take: MAX_REPLAY_TRADES,
    })
    return replayTrades(trades)
  }

  // Shared by /users/trades so the UI shows the same realized P&L as the reports
  async annotateTrades(userId, { side, since, limit = 200 } = {}) {
    const replay = await this.loadReplay(userId)
    const trades = await prisma.trade.findMany({
      where: {
        userId,
        source: 'user',
        ...(side ? { side } : {}),
        ...(since ? { time: { gte: since } } : {}),
      },
      orderBy: { time: 'desc' },
      take: limit,
    })
    return trades.map((t) => ({ ...t, pnl: replay.pnlById.get(t.id) || 0 }))
  }

  async calculatePerformanceMetrics(userId, timeRange = 30) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')

    const prices = await this.loadPrices()
    const replay = await this.loadReplay(userId)
    const since = Date.now() - timeRange * DAY_MS

    const periodSells = replay.sells.filter((s) => s.time >= since)
    const realized = sum(periodSells, (s) => s.pnl)
    const { unrealized, basis } = valueUnrealized(replay.books, user.portfolio || {}, prices)

    const wins = periodSells.filter((s) => s.pnl > 0)
    const losses = periodSells.filter((s) => s.pnl < 0)
    const grossProfit = sum(wins, (s) => s.pnl)
    const grossLoss = Math.abs(sum(losses, (s) => s.pnl))
    const capital = basis + sum(periodSells, (s) => s.costOut)
    const totalPnL = realized + unrealized

    const totalTrades = await prisma.trade.count({
      where: { userId, source: 'user', time: { gte: BigInt(since) } },
    })

    return {
      totalReturn: capital > 0 ? +((totalPnL / capital) * 100).toFixed(2) : 0,
      totalPnL: +totalPnL.toFixed(2),
      realizedPnL: +realized.toFixed(2),
      unrealizedPnL: +unrealized.toFixed(2),
      winRate: periodSells.length > 0 ? +((wins.length / periodSells.length) * 100).toFixed(2) : 0,
      totalTrades,
      winningTrades: wins.length,
      losingTrades: losses.length,
      // Volatility, Sharpe and drawdown need continuous equity snapshots that are
      // not stored yet; null lets the UI show "no data" instead of a fake zero
      volatility: null,
      sharpeRatio: null,
      maxDrawdown: null,
      avgWin: wins.length ? +(grossProfit / wins.length).toFixed(2) : 0,
      avgLoss: losses.length ? +(-grossLoss / losses.length).toFixed(2) : 0,
      profitFactor: grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : 0,
      lastUpdated: new Date(),
    }
  }

  async getRiskMetrics(userId) {
    const portfolio = await this.calculatePortfolioValue(userId)
    const holdings = portfolio.holdings.filter((h) => h.value > 0)

    if (!holdings.length) {
      return {
        var95: null,
        // No position means concentration cannot be measured; 0 would read as "safe"
        concentrationRisk: null,
        correlationRisk: null,
        leverageRatio: 1,
        betaToMarket: null,
        trackingError: null,
        lastUpdated: new Date(),
      }
    }

    const holdingsValue = holdings.reduce((s, h) => s + h.value, 0)
    const weights = holdings.map((h) => ({ asset: h.asset, weight: h.value / holdingsValue }))
    const series = await returnsBySymbol(weights.map((w) => w.asset))

    // Parametric 1-day 95% VaR from each asset's own daily volatility; cross
    // correlations are ignored, so this is a lower bound rather than a full
    // portfolio estimate. It only appears when at least one series is long enough.
    let variance = 0
    let measured = 0
    for (const w of weights) {
      const points = series.get(w.asset)
      const sigma = points ? stdev(points.map((p) => p.value)) : null
      if (sigma == null) continue
      variance += (w.weight * sigma) ** 2
      measured += 1
    }
    const var95 = measured > 0 ? +(1.645 * Math.sqrt(variance) * holdingsValue).toFixed(2) : null

    // Portfolio vs an equal-weight index of the same assets, only on days where
    // every held asset traded; partial days would bias the covariance
    let betaToMarket = null
    let trackingError = null
    if (weights.length > 0 && weights.every((w) => series.has(w.asset))) {
      const days = series.get(weights[0].asset).map((p) => p.day)
      const common = days.filter((day) => weights.every((w) => series.get(w.asset).some((p) => p.day === day)))
      if (common.length >= 5) {
        const portfolioReturns = common.map((day) =>
          weights.reduce((total, w) => total + w.weight * series.get(w.asset).find((p) => p.day === day).value, 0)
        )
        const marketReturns = common.map((day) =>
          weights.reduce((total, w) => total + series.get(w.asset).find((p) => p.day === day).value, 0) / weights.length
        )
        const pairs = portfolioReturns.map((value, i) => [value, marketReturns[i]])
        const cov = covariance(pairs)
        const marketVariance = stdev(marketReturns) ** 2
        if (cov != null && marketVariance > 0) betaToMarket = +(cov / marketVariance).toFixed(2)
        const diffs = portfolioReturns.map((value, i) => value - marketReturns[i])
        const te = stdev(diffs)
        if (te != null) trackingError = +(te * 100).toFixed(2)
      }
    }

    // Average pairwise correlation of the held assets over their common days
    let correlationRisk = null
    const assets = [...series.keys()]
    if (assets.length >= 2) {
      const values = []
      for (let i = 0; i < assets.length; i++) {
        for (let j = i + 1; j < assets.length; j++) {
          const pairs = alignReturns(series.get(assets[i]), series.get(assets[j]))
          if (pairs.length < 2) continue
          const cov = covariance(pairs)
          const sx = stdev(pairs.map((p) => p[0]))
          const sy = stdev(pairs.map((p) => p[1]))
          if (cov != null && sx > 0 && sy > 0) values.push(cov / (sx * sy))
        }
      }
      if (values.length) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        correlationRisk = avg > 0.7 ? 'High' : avg > 0.4 ? 'Medium' : 'Low'
      }
    }

    return {
      var95,
      concentrationRisk: Math.max(...holdings.map((h) => h.allocation)),
      correlationRisk,
      // No margin product exists, so gross exposure always equals equity
      leverageRatio: 1,
      betaToMarket,
      trackingError,
      lastUpdated: new Date(),
    }
  }

  async getPortfolioComposition(userId) {
    const portfolio = await this.calculatePortfolioValue(userId)
    const prices = await this.loadPrices()

    return {
      byAsset: portfolio.holdings.map((h) => ({
        asset: h.asset,
        allocation: h.allocation,
        value: h.value,
        quantity: h.quantity,
        marketPrice: h.marketPrice,
        change24h: prices[h.asset]?.change24h || 0,
      })),
      cashAllocation: portfolio.totalValue > 0 ? (portfolio.cashBalance / portfolio.totalValue) * 100 : 100,
    }
  }
}

module.exports = new PortfolioService()
