const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireUser } = require('../middleware/auth')
const { executeOrder, cancelOrder, orderDto, TradeError } = require('../services/matchingEngine')

const router = express.Router()

const asArray = (v) => (Array.isArray(v) ? v : [])

// Serializable writes abort under contention; retry briefly, then report a conflict instead of a 500
async function serializable(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (e) {
      if (e.code === 'P2034' && attempt < 2) continue
      if (e.code === 'P2034') {
        const err = new Error('Concurrent update, please retry')
        err.status = 409
        throw err
      }
      throw e
    }
  }
}

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
      tradingBots: u.tradingBots,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })
  } catch (e) {
    next(e)
  }
})

router.get('/trades', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const trades = await prisma.trade.findMany({
      where: { userId: req.user.id, source: 'user' },
      orderBy: { time: 'desc' },
      take: 200,
    })
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
  const stop = ['stop-loss', 'stop-limit'].includes(rawType)
  // Legacy clients send side in `type` and still pass a price; those are limit orders
  const legacyWithPrice = ['buy', 'sell'].includes(rawType) && body.price != null
  const type = ['limit', 'stop-loss', 'stop-limit'].includes(rawType) || legacyWithPrice ? 'limit' : 'market'
  const price = body.price != null ? +body.price : null
  let amount = body.amount != null ? +body.amount : null
  let size = body.size != null ? +body.size : null
  if (amount == null && body.quantity != null) {
    if (side === 'buy') amount = +body.quantity * +(body.price || 0)
    else size = +body.quantity
  }
  return { symbol, side, type, price, amount, size, stop }
}

async function placeOrder(req, res, next) {
  try {
    const payload = normalizeOrder(req.body)
    if (!payload.symbol || !['buy', 'sell'].includes(payload.side)) {
      return res.status(400).json({ success: false, error: 'symbol and side are required' })
    }
    // A stop order executed as a plain limit order would fire immediately at the wrong price
    if (payload.stop) {
      return res.status(400).json({ success: false, error: 'Stop orders are not available yet' })
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
    const list = asArray(req.user.watchlist)
    if (list.some((i) => i.asset === asset)) {
      return res.status(400).json({ success: false, error: 'Asset already in watchlist' })
    }
    list.push({ asset, addedAt: new Date().toISOString() })
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
    if (!asset || price == null || !['above', 'below'].includes(type)) {
      return res.status(400).json({ success: false, error: 'asset / price / type required' })
    }
    const list = asArray(req.user.priceAlerts)
    const alert = {
      id: Date.now().toString(),
      asset,
      price: +price,
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
      const dbStatus = map[status] || status
      where.status = dbStatus
    }
    if (days) {
      where.createdAt = { gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
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
    const where = { userId: req.user.id, source: 'user' }
    if (type && type !== 'all') where.side = type
    if (days) {
      where.time = { gte: BigInt(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
    }
    const trades = await prisma.trade.findMany({ where, orderBy: { time: 'desc' }, take: 500 })
    res.json(trades.map(toTradeDto))
  } catch (e) {
    next(e)
  }
})

// --- User trading bots ---

router.get('/trading-bots', authenticateToken, requireUser, (req, res) => {
  res.json(asArray(req.user.tradingBots))
})

router.post('/trading-bots', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { name, strategy, asset, investment, ...config } = req.body
    const inv = +investment
    if (!(inv > 0) || inv > req.user.balance) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' })
    }

    const bot = {
      id: Date.now().toString(),
      name,
      strategy,
      asset,
      investment: inv,
      config,
      status: 'active',
      profit: 0,
      trades: 0,
      performance: 0,
      createdAt: new Date().toISOString(),
    }

    // Re-read inside the transaction: the auth snapshot may already be stale and would
    // resurrect bots removed by a parallel delete
    const debited = await serializable(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: req.user.id } })
      const list = asArray(u.tradingBots)
      list.push(bot)
      return tx.user.updateMany({
        where: { id: req.user.id, balance: { gte: inv } },
        data: { balance: { decrement: inv }, tradingBots: list },
      })
    })
    if (debited.count === 0) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' })
    }
    res.json({ success: true, bot })
  } catch (e) {
    next(e)
  }
})

router.patch('/trading-bots/:botId/:action', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { botId, action } = req.params
    if (!['start', 'pause'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' })
    }
    // Same reason as create: write the list only after re-reading it in the transaction
    const found = await serializable(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: req.user.id } })
      const list = asArray(u.tradingBots)
      const bot = list.find((b) => b.id === botId)
      if (!bot) return false
      bot.status = action === 'start' ? 'active' : 'paused'
      await tx.user.update({ where: { id: req.user.id }, data: { tradingBots: list } })
      return true
    })
    if (!found) return res.status(404).json({ success: false, error: 'Bot not found' })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.delete('/trading-bots/:botId', authenticateToken, requireUser, async (req, res, next) => {
  try {
    // Refund must be tied to the removal itself; a stale read lets two concurrent deletes refund twice
    const run = () =>
      prisma.$transaction(
        async (tx) => {
          const u = await tx.user.findUnique({ where: { id: req.user.id } })
          if (!u) return { status: 404 }
          const list = asArray(u.tradingBots)
          const idx = list.findIndex((b) => b.id === req.params.botId)
          if (idx === -1) return { status: 404 }
          const bot = list[idx]
          await tx.user.update({
            where: { id: req.user.id },
            data: {
              balance: { increment: (bot.investment || 0) + (bot.profit || 0) },
              tradingBots: list.filter((_, i) => i !== idx),
            },
          })
          return { status: 200 }
        },
        { isolationLevel: 'Serializable' }
      )

    let result
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await run()
        break
      } catch (e) {
        if (e.code === 'P2034' && attempt === 0) continue
        throw e
      }
    }
    if (!result || result.status === 404) {
      return res.status(404).json({ success: false, error: 'Bot not found' })
    }
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

module.exports = router
