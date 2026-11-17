const express = require('express')
const prisma = require('../db')
const { displayPrice } = require('../services/priceEngine')
const { getOrderBook, getRecentTrades, buildCandles } = require('../services/matchingEngine')

const router = express.Router()

// Candles are aggregated from up to 20000 trades, so a short TTL keeps polling
// dashboards from redoing the same aggregation on every request.
const CHART_CACHE_TTL_MS = 60 * 1000
const CHART_CACHE_MAX = 500
const chartCache = new Map()

const TIMEFRAMES = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w'])

function normalizeTimeframe(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (TIMEFRAMES.has(value)) return value
  // Legacy numeric timeframe (days): clamp to 1-365, then use the closest bucket
  const parsed = parseInt(value, 10)
  if (Number.isFinite(parsed)) {
    const days = Math.min(365, Math.max(1, parsed))
    return days <= 120 ? '1d' : '1w'
  }
  return '1h'
}

function getCachedCandles(key) {
  const entry = chartCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CHART_CACHE_TTL_MS) {
    chartCache.delete(key)
    return null
  }
  return entry.ohlcv
}

function setCachedCandles(key, ohlcv) {
  if (chartCache.size >= CHART_CACHE_MAX) {
    // Map preserves insertion order, so the first key is the oldest entry
    chartCache.delete(chartCache.keys().next().value)
  }
  chartCache.set(key, { ts: Date.now(), ohlcv })
}

async function loadCoins() {
  return prisma.marketData.findMany({ where: { delisted: false }, orderBy: { symbol: 'asc' } })
}

// Legacy shape: { "BTC/GULU": { price, change, volume } }, still read by the dashboard
router.get('/prices', async (req, res, next) => {
  try {
    const coins = await loadCoins()
    const out = {}
    for (const c of coins) {
      const price = displayPrice(c)
      out[`${c.symbol}/GULU`] = {
        symbol: c.symbol,
        name: c.name,
        price,
        current_price: price,
        change: c.change24h,
        change24h: c.change24h,
        volume: c.volume24h,
        volume24h: c.volume24h,
        timestamp: Date.now(),
      }
    }
    res.json(out)
  } catch (e) {
    next(e)
  }
})

// Array shape used by the WebSocket fallback poller
router.get('/list', async (req, res, next) => {
  try {
    const coins = await loadCoins()
    res.json({
      success: true,
      data: coins.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        price: displayPrice(c),
        current_price: displayPrice(c),
        change24h: c.change24h,
        volume24h: c.volume24h,
        decimals: c.decimals,
      })),
    })
  } catch (e) {
    next(e)
  }
})

router.get('/chart/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().split('/')[0]
    const { indicators } = req.query
    const timeframe = normalizeTimeframe(req.query.timeframe)
    const coin = await prisma.marketData.findUnique({ where: { symbol } })
    if (!coin) return res.status(404).json({ success: false, message: 'symbol not found' })

    // Candles are aggregated from executed trades; a market with no fills has no chart history yet
    const cacheKey = `${symbol}|${timeframe}`
    let ohlcv = getCachedCandles(cacheKey)
    if (!ohlcv) {
      ohlcv = await buildCandles(symbol, timeframe)
      setCachedCandles(cacheKey, ohlcv)
    }
    const response = { ohlcv }
    if (indicators && ohlcv.length) {
      response.indicators = calculateTechnicalIndicators(ohlcv, indicators.split(','))
    }
    res.json(response)
  } catch (e) {
    next(e)
  }
})

router.get('/orderbook/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().split('/')[0]
    const depth = Math.min(50, Math.max(1, parseInt(req.query.depth) || 20))
    const book = await getOrderBook(symbol, depth)
    res.json(book)
  } catch (e) {
    next(e)
  }
})

router.get('/trades/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().split('/')[0]
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 40))
    res.json(await getRecentTrades(symbol, limit))
  } catch (e) {
    next(e)
  }
})

router.get('/overview', async (req, res, next) => {
  try {
    const coins = await loadCoins()
    // Only figures the venue can actually measure; no market-cap or dominance
    // estimate is possible because the token supply is not a market cap
    res.json({
      total24hVolume: coins.reduce((s, c) => s + c.volume24h, 0),
      activeCoins: coins.length,
      markets: coins.length,
    })
  } catch (e) {
    next(e)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').toUpperCase()
    const coins = await loadCoins()
    res.json(
      coins
        .filter((c) => c.symbol.includes(q) || c.name.toUpperCase().includes(q))
        .map((c) => ({ symbol: c.symbol, name: c.name, price: displayPrice(c), change24h: c.change24h }))
    )
  } catch (e) {
    next(e)
  }
})

function calculateTechnicalIndicators(data, indicators) {
  const prices = data.map((d) => d.close)
  const result = {}
  if (indicators.includes('sma')) result.sma = calculateSMA(prices, 20)
  if (indicators.includes('ema')) result.ema = calculateEMA(prices, 20)
  if (indicators.includes('rsi')) result.rsi = calculateRSI(prices, 14)
  if (indicators.includes('macd')) result.macd = calculateMACD(prices)
  if (indicators.includes('bollinger')) result.bollinger = calculateBollingerBands(prices, 20)
  return result
}

function calculateSMA(prices, period) {
  const sma = []
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    sma.push(sum / period)
  }
  return sma
}

function calculateEMA(prices, period) {
  const ema = []
  const multiplier = 2 / (period + 1)
  ema[0] = prices[0]
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1]
  }
  return ema
}

function calculateRSI(prices, period) {
  const rsi = []
  const gains = []
  const losses = []
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }
  for (let i = period - 1; i < gains.length; i++) {
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - 100 / (1 + rs))
  }
  return rsi
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  const macdLine = ema12.map((val, i) => val - ema26[i])
  const signalLine = calculateEMA(macdLine, 9)
  const histogram = macdLine.map((val, i) => val - signalLine[i])
  return { macdLine, signalLine, histogram }
}

function calculateBollingerBands(prices, period) {
  const sma = calculateSMA(prices, period)
  const bands = { upper: [], middle: sma, lower: [] }
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period
    const stdDev = Math.sqrt(variance)
    bands.upper.push(sma[i - period + 1] + stdDev * 2)
    bands.lower.push(sma[i - period + 1] - stdDev * 2)
  }
  return bands
}

module.exports = router
