const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireUser } = require('../middleware/auth')
const { executeOrder, cancelOrder, orderDto, TradeError } = require('../services/matchingEngine')
const portfolioService = require('../services/portfolioService')

const router = express.Router()

const asArray = (v) => (Array.isArray(v) ? v : [])

const toTradeDto = (t) => ({
  id: t.id,
  side: t.side,
  size: t.size,
  price: t.price,
  pnl: t.pnl,
  time: Number(t.time),
  symbol: t.symbol,
  // legacy field names still read by Portfolio and OrderHistory
  type: t.side,
  asset: t.symbol,
  quantity: t.size,
  amount: t.size * t.price,
  timestamp: Number(t.time),
  status: 'completed',
})

router.get('/profile', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const u = req.user
    res.json({
      _id: u.id,
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      balance: u.balance,
      locked: u.locked,
      portfolio: u.portfolio,
      watchlist: u.watchlist,
      priceAlerts: u.priceAlerts,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })
  } catch (e) {
    next(e)
  }
})

router.get('/trades', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const trades = await portfolioService.annotateTrades(req.user.id, { limit: 200 })
    res.json(trades.map(toTradeDto))
  } catch (e) {
    next(e)
  }
})

// Accepts both the current order payload and the legacy trade payload so old
// clients keep working while every fill goes through the matching engine
function normalizeOrder(body) {
  const symbol = String(body.symbol || body.asset || '').toUpperCase().split('/')[0]
  const side = body.side || (['buy', 'sell'].includes(body.type) ? body.type : null)
  const rawType = body.orderType || body.type
  const stopType =
    rawType === 'stop-loss' || rawType === 'stop_loss'
      ? 'stop_loss'
      : rawType === 'stop-limit' || rawType === 'stop_limit'
        ? 'stop_limit'
        : null
  // Legacy clients send side in `type` and still pass a price; those are limit orders
  const legacyWithPrice = ['buy', 'sell'].includes(rawType) && body.price != null
  const type = ['limit', 'stop-loss', 'stop-limit'].includes(rawType) || legacyWithPrice ? 'limit' : 'market'
  const price = body.price != null ? +body.price : null
  const triggerPrice = body.triggerPrice != null ? +body.triggerPrice : null
  let amount = body.amount != null ? +body.amount : null
  let size = body.size != null ? +body.size : null
  if (amount == null && body.quantity != null) {
    if (side === 'buy') amount = +body.quantity * +(body.price || 0)
    else size = +body.quantity
  }
  return { symbol, side, type, price, amount, size, stopType, triggerPrice }
}

async function placeStopOrder(req, res, payload) {
  const { symbol, side, stopType, price, triggerPrice } = payload
  // Stop schedules are always sized in base units; a quote amount is ambiguous for buys
  const size = payload.size != null ? payload.size : side === 'sell' ? payload.amount : null
  if (!Number.isFinite(triggerPrice) || !(triggerPrice > 0) || triggerPrice > 1e12) {
    return res.status(400).json({ success: false, error: 'triggerPrice must be a positive number' })
  }
  if (!Number.isFinite(size) || !(size > 0) || size > 1e9) {
    return res.status(400).json({ success: false, error: 'size must be a positive number' })
  }
  if (stopType === 'stop_limit' && (!Number.isFinite(price) || !(price > 0) || price > 1e12)) {
    return res.status(400).json({ success: false, error: 'limit price required for a stop-limit order' })
  }
  if (stopType === 'stop_limit' && Math.abs(price / triggerPrice - 1) > 0.2) {
    return res.status(400).json({ success: false, error: 'limit price is too far from the trigger price' })
  }

  const coin = await prisma.marketData.findUnique({ where: { symbol } })
  if (!coin || coin.delisted) {
    return res.status(400).json({ success: false, error: 'market not available' })
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user) return res.status(401).json({ success: false, error: 'user not found' })

  // Nothing is locked while a stop waits, so require funding up front and re-check on firing.
  // Everything already armed counts too, otherwise one balance could back many stops.
  const reference = stopType === 'stop_limit' ? price : triggerPrice * 1.01
  const armed = await prisma.order.findMany({
    where: { userId: user.id, type: { in: ['stop_loss', 'stop_limit'] }, status: 'open' },
    select: { side: true, size: true, price: true, triggerPrice: true, type: true },
  })
  const reservedQuote = armed
    .filter((o) => o.side === 'buy')
    .reduce((sum, o) => sum + o.size * (o.type === 'stop_limit' ? o.price : o.triggerPrice * 1.01), 0)
  const reservedBase = armed.filter((o) => o.side === 'sell').reduce((sum, o) => sum + o.size, 0)

  if (side === 'buy' && user.balance + 1e-9 < reservedQuote + size * reference) {
    return res.status(400).json({ success: false, error: 'insufficient balance for this and armed stop orders' })
  }
  if (side === 'sell' && Number((user.portfolio || {})[symbol] || 0) + 1e-9 < reservedBase + size) {
    return res.status(400).json({ success: false, error: 'insufficient holdings for this and armed stop orders' })
  }

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      symbol,
      side,
      type: stopType,
      // The display price is the activation level unless a limit price was given
      price: stopType === 'stop_limit' ? price : triggerPrice,
      triggerPrice,
      size,
      status: 'open',
    },
  })

  const io = req.app.get('io')
  if (io) io.to(`user-${user.id}`).emit('order:update', { orderId: order.id, status: 'open' })

  return res.status(201).json({ success: true, order: orderDto(order), balance: user.balance, portfolio: user.portfolio })
}

async function placeOrder(req, res, next) {
  try {
    const payload = normalizeOrder(req.body)
    if (!payload.symbol || !['buy', 'sell'].includes(payload.side)) {
      return res.status(400).json({ success: false, error: 'symbol and side are required' })
    }
    if (payload.stopType) {
      return await placeStopOrder(req, res, payload)
    }
    const result = await executeOrder({ userId: req.user.id, ...payload }, req.app.get('io'))
    res.json({
      success: true,
      order: result.order,
      fills: result.fills,
      lastPrice: result.lastPrice,
      balance: result.user.balance,
      portfolio: result.user.portfolio,
    })
  } catch (e) {
    if (e instanceof TradeError) {
      return res.status(e.status).json({ success: false, error: e.message })
    }
    next(e)
  }
}

router.post('/orders', authenticateToken, requireUser, placeOrder)
router.post('/trades', authenticateToken, requireUser, placeOrder)

router.get('/portfolio', authenticateToken, requireUser, async (req, res, next) => {
  try {
    res.json({ portfolio: req.user.portfolio || {}, balance: req.user.balance })
  } catch (e) {
    next(e)
  }
})

router.get('/watchlist', authenticateToken, requireUser, async (req, res) => {
  res.json(asArray(req.user.watchlist))
})

router.post('/watchlist', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { asset } = req.body
    if (!asset) return res.status(400).json({ success: false, error: 'asset required' })
    const symbol = String(asset).toUpperCase()
    const coin = await prisma.marketData.findUnique({ where: { symbol } })
    if (!coin || coin.delisted) {
      return res.status(400).json({ success: false, error: 'market not available' })
    }
    const list = asArray(req.user.watchlist)
    if (list.some((i) => i.asset === symbol)) {
      return res.status(400).json({ success: false, error: 'Asset already in watchlist' })
    }
    list.push({ asset: symbol, addedAt: new Date().toISOString() })
    await prisma.user.update({ where: { id: req.user.id }, data: { watchlist: list } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.delete('/watchlist/:asset', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const list = asArray(req.user.watchlist).filter((i) => i.asset !== req.params.asset)
    await prisma.user.update({ where: { id: req.user.id }, data: { watchlist: list } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.get('/alerts', authenticateToken, requireUser, async (req, res) => {
  res.json(asArray(req.user.priceAlerts))
})

router.post('/alerts', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { asset, price, type } = req.body
    const target = +price
    if (!asset || !Number.isFinite(target) || target <= 0 || !['above', 'below'].includes(type)) {
      return res.status(400).json({ success: false, error: 'asset / price / type required' })
    }
    const symbol = String(asset).toUpperCase()
    const coin = await prisma.marketData.findUnique({ where: { symbol } })
    if (!coin || coin.delisted) {
      return res.status(400).json({ success: false, error: 'market not available' })
    }
    const list = asArray(req.user.priceAlerts)
    const alert = {
      id: Date.now().toString(),
      asset: symbol,
      price: target,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    list.push(alert)
    await prisma.user.update({ where: { id: req.user.id }, data: { priceAlerts: list } })
    res.json({ success: true, alert })
  } catch (e) {
    next(e)
  }
})

router.delete('/alerts/:alertId', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const list = asArray(req.user.priceAlerts).filter((a) => a.id !== req.params.alertId)
    await prisma.user.update({ where: { id: req.user.id }, data: { priceAlerts: list } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.get('/orders', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const rows = await prisma.order.findMany({
      where: { userId: req.user.id, status: { in: ['open', 'partial'] } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(rows.map(orderDto))
  } catch (e) {
    next(e)
  }
})

router.delete('/orders/:orderId', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const result = await cancelOrder(
      { userId: req.user.id, orderId: req.params.orderId },
      req.app.get('io')
    )
    res.json({ success: true, order: result.order, balance: result.balance, portfolio: result.portfolio })
  } catch (e) {
    if (e instanceof TradeError) {
      return res.status(e.status).json({ success: false, error: e.message })
    }
    next(e)
  }
})

router.get('/orders/history', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { status, days } = req.query
    const where = { userId: req.user.id }
    if (status && status !== 'all') {
      // History filters use the legacy vocabulary shown in the UI
      const map = { completed: 'filled', pending: 'open', cancelled: 'canceled', partial: 'partial' }
      const dbStatus = map[status]
      // An unknown value must not reach the enum filter, Prisma would reject the whole query
      if (dbStatus) where.status = dbStatus
    }
    const parsedDays = parseInt(days, 10)
    if (Number.isFinite(parsedDays) && parsedDays > 0) {
      where.createdAt = { gte: new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000) }
    }
    const rows = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 })
    res.json(rows.map(orderDto))
  } catch (e) {
    next(e)
  }
})

router.get('/trades/history', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { type, days } = req.query
    const parsedDays = parseInt(days, 10)
    const since = Number.isFinite(parsedDays) && parsedDays > 0
      ? BigInt(Date.now() - parsedDays * 24 * 60 * 60 * 1000)
      : null
    const trades = await portfolioService.annotateTrades(req.user.id, {
      // Only a real side may be used as a filter; status words from the orders tab
      // used to reach the enum and turned the whole request into a 500
      side: ['buy', 'sell'].includes(type) ? type : null,
      since,
      limit: 500,
    })
    res.json(trades.map(toTradeDto))
  } catch (e) {
    next(e)
  }
})

module.exports = router
