const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

router.post('/coins', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { symbol, name, price, volatility, decimals, autoSync } = req.body
    if (!symbol || !name || price == null) {
      return res.status(400).json({ success: false, message: 'symbol / name / price required' })
    }
    const s = norm(symbol)
    const exists = await prisma.marketData.findUnique({ where: { symbol: s } })
    if (exists) return res.status(409).json({ success: false, message: `${s} already exists` })

    const p = +price
    const coin = await prisma.marketData.create({
      data: {
        symbol: s,
        name,
        price: p,
        manualPrice: p,
        open24h: p,
        volatility: +(volatility ?? 0.8),
        decimals: +(decimals ?? 2),
        autoSync: autoSync ?? false,
      },
    })
    req.app.get('io').to('market').emit('coin:listed', { symbol: s, name, price: p })
    res.json({ success: true, coin })
  } catch (e) {
    next(e)
  }
})

router.post('/coins/:symbol/price', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const symbol = norm(req.params.symbol)
    const c = await prisma.marketData.findUnique({ where: { symbol } })
    if (!c) return res.status(404).json({ success: false, message: 'coin not found' })

    const old = c.manualPrice ?? c.price
    const price = +req.body.price
    if (!Number.isFinite(price)) {
      return res.status(400).json({ success: false, message: 'invalid price' })
    }
    const open = c.open24h || price
    const updated = await prisma.marketData.update({
      where: { symbol },
      data: {
        manualPrice: price,
        price,
        open24h: open,
        change24h: +(((price - open) / open) * 100).toFixed(2),
      },
    })
    req.app.get('io').to('market').emit('price:update', {
      prices: [{ symbol, price: updated.price, change24h: updated.change24h }],
      timestamp: Date.now(),
    })
    console.log(`[admin] ${req.user.email} set ${symbol} ${old} -> ${price}`)
    res.json({ success: true, symbol, price: updated.price, change24h: updated.change24h })
  } catch (e) {
    next(e)
  }
})

router.post('/prices/batch', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items must be an array' })
    }
    const out = []
    for (const it of items) {
      const symbol = norm(it.symbol)
      const c = await prisma.marketData.findUnique({ where: { symbol } })
      if (!c) continue
      const base = c.manualPrice ?? c.price
      const price =
        it.price != null ? +it.price : +(base * (1 + (it.deltaPct ?? 0) / 100)).toFixed(c.decimals)
      const open = c.open24h || price
      const updated = await prisma.marketData.update({
        where: { symbol },
        data: {
          manualPrice: price,
          price,
          open24h: open,
          change24h: +(((price - open) / open) * 100).toFixed(2),
        },
      })
      out.push({ symbol, price: updated.price, change24h: updated.change24h })
    }
    req.app.get('io').to('market').emit('price:update', { prices: out, timestamp: Date.now() })
    res.json({ success: true, count: out.length, items: out })
  } catch (e) {
    next(e)
  }
})

router.post('/coins/:symbol/release', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const symbol = norm(req.params.symbol)
    await prisma.marketData.update({ where: { symbol }, data: { manualPrice: null } })
    res.json({ success: true, symbol, mode: 'auto' })
  } catch (e) {
    next(e)
  }
})

router.delete('/coins/:symbol', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const symbol = norm(req.params.symbol)
    await prisma.marketData.update({
      where: { symbol },
      data: { delisted: true, delistedAt: new Date() },
    })
    req.app.get('io').to('market').emit('coin:delisted', { symbol })
    res.json({ success: true, symbol, delisted: true })
  } catch (e) {
    next(e)
  }
})

router.post('/coins/:symbol/restore', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const symbol = norm(req.params.symbol)
    await prisma.marketData.update({
      where: { symbol },
      data: { delisted: false, delistedAt: null },
    })
    req.app.get('io').to('market').emit('coin:listed', { symbol })
    res.json({ success: true, symbol, delisted: false })
  } catch (e) {
    next(e)
  }
})

router.get('/coins', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const rows = await prisma.marketData.findMany({
      where: req.query.includeDelisted === 'true' ? {} : { delisted: false },
      orderBy: { symbol: 'asc' },
    })
    res.json({
      success: true,
      coins: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: r.manualPrice ?? r.price,
        manualPrice: r.manualPrice,
        controlled: r.manualPrice != null,
        autoSync: r.autoSync,
        volatility: r.volatility,
        decimals: r.decimals,
        change24h: r.change24h,
        volume24h: r.volume24h,
        delisted: r.delisted,
      })),
    })
  } catch (e) {
    next(e)
  }
})

module.exports = router
