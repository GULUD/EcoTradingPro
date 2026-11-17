const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireUser } = require('../middleware/auth')

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

router.post('/trades', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { type, asset, quantity, orderType } = req.body
    if (!type || !asset || !quantity) {
      return res.status(400).json({ success: false, error: 'Missing required trade data' })
    }
    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid trade type' })
    }

    const symbol = String(asset).toUpperCase().split('/')[0]
    const coin = await prisma.marketData.findUnique({ where: { symbol } })
    if (!coin || coin.delisted) {
      return res.status(400).json({ success: false, error: 'Market not available' })
    }

    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) {
      return res.status(400).json({ success: false, error: 'Invalid quantity' })
    }

    // Execution price and amount are always derived server-side; client-supplied price/amount is ignored
    const px = +(coin.manualPrice ?? coin.price).toFixed(coin.decimals ?? 2)
    const amt = +(qty * px).toFixed(2)
    if (!(px > 0) || !(amt > 0)) {
      return res.status(400).json({ success: false, error: 'Invalid amount or price' })
    }

    const execute = () =>
      prisma.$transaction(
        async (tx) => {
          const u = await tx.user.findUnique({ where: { id: req.user.id } })
          if (!u) return { reject: { status: 401, error: 'User not found' } }

          const portfolio = { ...(u.portfolio || {}) }
          const held = Number(portfolio[symbol] || 0)

          if (type === 'buy' && u.balance < amt) {
            return { reject: { status: 400, error: 'Insufficient balance' } }
          }
          if (type === 'sell' && held < qty) {
            return { reject: { status: 400, error: 'Insufficient holdings' } }
          }

          const nextQty = +(held + (type === 'buy' ? qty : -qty)).toFixed(8)
          if (nextQty > 0) portfolio[symbol] = nextQty
          else delete portfolio[symbol]

          const updated = await tx.user.update({
            where: { id: req.user.id },
            data: {
              balance: type === 'buy' ? { decrement: amt } : { increment: amt },
              portfolio,
            },
          })

          const trade = await tx.trade.create({
            data: {
              userId: req.user.id,
              symbol,
              side: type,
              size: qty,
              price: px,
              pnl: 0,
              source: 'user',
              time: BigInt(Date.now()),
            },
          })

          await tx.transaction.create({
            data: {
              userId: req.user.id,
              type: 'trade',
              amount: type === 'buy' ? -amt : amt,
              balanceBefore: u.balance,
              balanceAfter: updated.balance,
              reason: `${type} ${qty} ${symbol} @ ${px}${orderType ? ` (${orderType})` : ''}`,
              ts: BigInt(Date.now()),
            },
          })

          return { updated, trade }
        },
        { isolationLevel: 'Serializable' }
      )

    let result
    // Serializable transactions can abort under contention; one retry is enough for this write shape
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await execute()
        break
      } catch (e) {
        if (e.code === 'P2034' && attempt === 0) continue
        throw e
      }
    }

    if (result.reject) {
      return res
        .status(result.reject.status)
        .json({ success: false, error: result.reject.error })
    }

    const { updated, trade } = result
    const io = req.app.get('io')
    if (io) {
      io.to('market').emit('trade:executed', toTradeDto(trade))
      io.to(`user-${req.user.id}`).emit('balance:update', {
        balance: updated.balance,
        portfolio: updated.portfolio,
      })
    }

    res.json({
      success: true,
      trade: toTradeDto(trade),
      balance: updated.balance,
      portfolio: updated.portfolio,
    })
  } catch (e) {
    next(e)
  }
})

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

router.get('/orders', authenticateToken, requireUser, (req, res) => {
  res.json(asArray(req.user.orders).filter((o) => o.status === 'pending'))
})

router.delete('/orders/:orderId', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const list = asArray(req.user.orders).filter((o) => o.id !== req.params.orderId)
    await prisma.user.update({ where: { id: req.user.id }, data: { orders: list } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.get('/orders/history', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { status, days } = req.query
    let orders = asArray(req.user.orders)
    if (status && status !== 'all') orders = orders.filter((o) => o.status === status)
    if (days) {
      const since = Date.now() - parseInt(days) * 24 * 60 * 60 * 1000
      orders = orders.filter((o) => new Date(o.timestamp).getTime() >= since)
    }
    res.json(orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)))
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

    const list = asArray(req.user.tradingBots)
    list.push(bot)
    // Atomic conditional debit, otherwise two parallel requests could pass the balance check above
    const debited = await prisma.user.updateMany({
      where: { id: req.user.id, balance: { gte: inv } },
      data: { balance: { decrement: inv }, tradingBots: list },
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
    const list = asArray(req.user.tradingBots)
    const bot = list.find((b) => b.id === botId)
    if (!bot) return res.status(404).json({ success: false, error: 'Bot not found' })
    if (action === 'start') bot.status = 'active'
    else if (action === 'pause') bot.status = 'paused'
    else return res.status(400).json({ success: false, error: 'Invalid action' })
    await prisma.user.update({ where: { id: req.user.id }, data: { tradingBots: list } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.delete('/trading-bots/:botId', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const list = asArray(req.user.tradingBots)
    const idx = list.findIndex((b) => b.id === req.params.botId)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Bot not found' })
    const bot = list[idx]
    list.splice(idx, 1)
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        balance: { increment: (bot.investment || 0) + (bot.profit || 0) },
        tradingBots: list,
      },
    })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

module.exports = router
