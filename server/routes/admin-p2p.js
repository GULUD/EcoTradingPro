const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireAdmin } = require('../middleware/auth')
const { settleOrder, refundOrder, toOrderDto, loadOrderFull } = require('./p2p')

const router = express.Router()

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

// --- merchant review ---

router.get('/p2p/merchants', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status
    const where = status && status !== 'all' ? { status } : {}
    const merchants = await prisma.merchant.findMany({
      where,
      include: { user: true, ads: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(
      merchants.map((m) => ({
        id: m.id,
        userId: m.userId,
        businessName: m.businessName,
        contact: m.contact,
        status: m.status,
        isBot: m.isBot,
        note: m.note,
        maxOrderGulu: m.maxOrderGulu,
        dailyLimitGulu: m.dailyLimitGulu,
        completedOrders: m.completedOrders,
        userName: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
        balance: m.user.balance,
        locked: m.user.locked,
        activeAds: m.ads.filter((a) => a.status === 'active').length,
        createdAt: m.createdAt,
      }))
    )
  } catch (e) {
    next(e)
  }
})

router.post('/p2p/merchants/:id/review', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { status, note, maxOrderGulu, dailyLimitGulu } = req.body
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid status' })
    }
    const data = { status }
    if (note !== undefined) data.note = note || null
    if (maxOrderGulu != null && num(maxOrderGulu) > 0) data.maxOrderGulu = num(maxOrderGulu)
    if (dailyLimitGulu != null && num(dailyLimitGulu) > 0) data.dailyLimitGulu = num(dailyLimitGulu)

    const updated = await prisma.merchant.update({ where: { id: req.params.id }, data })
    // A suspended merchant must stop showing up in the P2P list immediately
    if (status !== 'approved') {
      await prisma.p2PAd.updateMany({ where: { merchantId: updated.id }, data: { status: 'paused' } })
    }
    res.json({ success: true, merchant: updated })
  } catch (e) {
    next(e)
  }
})

// --- order arbitration ---

router.get('/p2p/orders', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status
    const where = status && status !== 'all' ? { status } : {}
    const orders = await prisma.p2POrder.findMany({
      where,
      include: {
        ad: { include: { merchant: true } },
        buyer: { include: { merchant: true } },
        seller: { include: { merchant: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    res.json(
      orders.map((o) => ({
        ...toOrderDto(o, o.buyerId),
        buyerEmail: o.buyer.email,
        sellerEmail: o.seller.email,
      }))
    )
  } catch (e) {
    next(e)
  }
})

router.post('/p2p/orders/:id/resolve', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { action, note } = req.body
    if (!['complete', 'cancel'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be complete or cancel' })
    }
    const result = action === 'complete' ? await settleOrder(req.params.id, `admin ${req.user.email}`) : await refundOrder(req.params.id, `admin ${req.user.email}`, note, { allowPaid: true })
    if (result.reject) return res.status(result.reject.status).json({ success: false, error: result.reject.error })

    const full = await loadOrderFull(req.params.id)
    const io = req.app.get('io')
    if (io) {
      io.to(`user-${full.buyerId}`).emit('p2p:order', { orderId: full.id, status: full.status })
      io.to(`user-${full.sellerId}`).emit('p2p:order', { orderId: full.id, status: full.status })
    }
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.get('/p2p/stats', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const [merchants, openOrders, completed, disputed, lockedAgg] = await Promise.all([
      prisma.merchant.count({ where: { status: 'approved' } }),
      prisma.p2POrder.count({ where: { status: { in: ['pending_payment', 'paid'] } } }),
      prisma.p2POrder.count({ where: { status: 'completed' } }),
      prisma.p2POrder.count({ where: { status: 'disputed' } }),
      prisma.user.aggregate({ _sum: { locked: true } }),
    ])
    res.json({
      merchants,
      openOrders,
      completed,
      disputed,
      escrowed: lockedAgg._sum.locked || 0,
    })
  } catch (e) {
    next(e)
  }
})

// --- ad payment accounts: bots ship without one, so an admin must fill it before users can pay ---

router.get('/p2p/ads', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const ads = await prisma.p2PAd.findMany({
      include: { merchant: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(
      ads.map((a) => ({
        id: a.id,
        side: a.side,
        price: a.price,
        fiat: a.fiat,
        available: a.available,
        minAmount: a.minAmount,
        maxAmount: a.maxAmount,
        status: a.status,
        paymentMethods: Array.isArray(a.paymentMethods) ? a.paymentMethods : [],
        merchant: a.merchant.businessName,
        isBot: a.merchant.isBot,
        email: a.merchant.user.email,
        merchantId: a.merchantId,
      }))
    )
  } catch (e) {
    next(e)
  }
})

router.patch('/p2p/ads/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { paymentMethods, status, price, minAmount, maxAmount, available } = req.body
    const data = {}
    if (paymentMethods !== undefined) {
      const methods = (Array.isArray(paymentMethods) ? paymentMethods : []).filter((m) => m && m.type && m.account)
      if (!methods.length) return res.status(400).json({ success: false, error: 'at least one payment method required' })
      data.paymentMethods = methods
    }
    if (status && ['active', 'paused', 'closed'].includes(status)) data.status = status
    if (price != null && num(price) > 0) data.price = num(price)
    if (minAmount != null && num(minAmount) > 0) data.minAmount = num(minAmount)
    if (maxAmount != null && num(maxAmount) > 0) data.maxAmount = num(maxAmount)
    if (available != null && num(available) >= 0) data.available = num(available)

    const existing = await prisma.p2PAd.findUnique({
      where: { id: req.params.id },
      include: { merchant: { include: { user: true } } },
    })
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' })

    const finalMin = data.minAmount != null ? data.minAmount : existing.minAmount
    const finalMax = data.maxAmount != null ? data.maxAmount : existing.maxAmount
    if (!(finalMax >= finalMin)) {
      return res.status(400).json({ success: false, error: 'max amount must be greater than or equal to min amount' })
    }

    // A sell ad is a promise to deliver escrow; raising its depth beyond the
    // merchant's free balance would create liquidity that cannot settle
    if (data.available != null && existing.side === 'sell') {
      const open = await prisma.p2PAd.aggregate({
        where: {
          merchantId: existing.merchantId,
          side: 'sell',
          status: { in: ['active', 'paused'] },
          id: { not: existing.id },
        },
        _sum: { available: true },
      })
      const committed = open._sum.available || 0
      if (existing.merchant.user.balance + 1e-9 < committed + data.available) {
        return res.status(400).json({ success: false, error: 'Available exceeds merchant GULU balance' })
      }
    }

    const ad = await prisma.p2PAd.update({ where: { id: req.params.id }, data, include: { merchant: true } })
    res.json({ success: true, ad })
  } catch (e) {
    next(e)
  }
})

// --- GULU issuance ---

async function recordIssue(type, userId, amount, operator, note) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user) return { reject: { status: 404, error: 'User not found' } }

    const delta = type === 'mint' ? amount : -amount

    let updated
    if (type === 'burn') {
      // Conditional decrement: two concurrent burns must not drive the balance negative
      const moved = await tx.user.updateMany({
        where: { id: userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      })
      if (moved.count === 0) {
        return { reject: { status: 400, error: 'User balance is lower than the burn amount' } }
      }
      updated = await tx.user.findUnique({ where: { id: userId } })
    } else {
      updated = await tx.user.update({ where: { id: userId }, data: { balance: { increment: amount } } })
    }
    const issue = await tx.guluIssue.create({
      data: { type, amount, userId, operator, note: note || null, ts: BigInt(Date.now()) },
    })
    await tx.transaction.create({
      data: {
        userId,
        type: type === 'mint' ? 'gulu_mint' : 'gulu_burn',
        amount: delta,
        balanceBefore: +(updated.balance - delta).toFixed(8),
        balanceAfter: updated.balance,
        reason: `${type} ${amount} GULU${note ? `: ${note}` : ''}`,
        operator,
        ts: BigInt(Date.now()),
      },
    })
    return { issue: { ...issue, ts: Number(issue.ts) }, balance: updated.balance }
  })
}

router.post('/gulu/mint', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body
    const amt = num(amount)
    if (!userId || !(amt > 0) || amt > 1e12) return res.status(400).json({ success: false, error: 'invalid amount' })
    const r = await recordIssue('mint', userId, +amt.toFixed(8), req.user.email, note)
    if (r.reject) return res.status(r.reject.status).json({ success: false, error: r.reject.error })
    res.json({ success: true, ...r })
  } catch (e) {
    next(e)
  }
})

router.post('/gulu/burn', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body
    const amt = num(amount)
    if (!userId || !(amt > 0) || amt > 1e12) return res.status(400).json({ success: false, error: 'invalid amount' })
    const r = await recordIssue('burn', userId, +amt.toFixed(8), req.user.email, note)
    if (r.reject) return res.status(r.reject.status).json({ success: false, error: r.reject.error })
    res.json({ success: true, ...r })
  } catch (e) {
    next(e)
  }
})

router.get('/gulu/supply', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const [minted, burned, balances, lockedAgg] = await Promise.all([
      prisma.guluIssue.aggregate({ where: { type: 'mint' }, _sum: { amount: true } }),
      prisma.guluIssue.aggregate({ where: { type: 'burn' }, _sum: { amount: true } }),
      prisma.user.aggregate({ _sum: { balance: true } }),
      prisma.user.aggregate({ _sum: { locked: true } }),
    ])
    const totalMinted = minted._sum.amount || 0
    const totalBurned = burned._sum.amount || 0
    res.json({
      totalMinted,
      totalBurned,
      totalSupply: +(totalMinted - totalBurned).toFixed(8),
      circulating: +(balances._sum.balance || 0).toFixed(8),
      locked: +(lockedAgg._sum.locked || 0).toFixed(8),
    })
  } catch (e) {
    next(e)
  }
})

router.get('/gulu/issues', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const issues = await prisma.guluIssue.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { ts: 'desc' },
      take: 100,
    })
    res.json(issues.map((i) => ({ ...i, ts: Number(i.ts), userEmail: i.user?.email || null })))
  } catch (e) {
    next(e)
  }
})

module.exports = router
