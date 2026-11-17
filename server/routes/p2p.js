const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireUser } = require('../middleware/auth')

const router = express.Router()

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

const fail = (status, error) => ({ reject: { status, error } })

const methodsOf = (v) => (Array.isArray(v) ? v : [])

const toAdDto = (ad) => ({
  id: ad.id,
  side: ad.side,
  price: ad.price,
  fiat: ad.fiat,
  minAmount: ad.minAmount,
  maxAmount: ad.maxAmount,
  available: ad.available,
  paymentMethods: methodsOf(ad.paymentMethods),
  terms: ad.terms,
  status: ad.status,
  autoRelease: ad.autoRelease,
  merchant: {
    name: ad.merchant.businessName,
    isBot: ad.merchant.isBot,
    completedOrders: ad.merchant.completedOrders,
  },
  createdAt: ad.createdAt,
})

const toOrderDto = (o, viewerId) => {
  const role = o.buyerId === viewerId ? 'buyer' : 'seller'
  const other = role === 'buyer' ? o.seller : o.buyer
  const closed = ['completed', 'cancelled'].includes(o.status)
  return {
    id: o.id,
    adId: o.adId,
    side: o.ad.side,
    role,
    amount: o.amount,
    price: o.price,
    fiatAmount: o.fiatAmount,
    fiat: o.fiat,
    status: o.status,
    counterparty: {
      name: other.merchant?.businessName || `${other.firstName} ${other.lastName}`.trim(),
      isBot: !!other.merchant?.isBot,
    },
    paymentMethods: methodsOf(o.ad.paymentMethods),
    paymentMethod: o.paymentMethod,
    paymentRef: o.paymentRef,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    completedAt: o.completedAt,
    canPay: role === 'buyer' && o.status === 'pending_payment',
    canRelease: role === 'seller' && o.status === 'paid',
    canCancel: o.status === 'pending_payment' || (o.status === 'paid' && role === 'buyer'),
    canDispute: o.status === 'paid',
    closed,
  }
}

// Serializable writes are the only guard against the same GULU being escrowed twice.
// Neon's pooler can stall a connection briefly, so the wait budget is wider than the 5s default.
async function writeTx(fn) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable', maxWait: 15000, timeout: 30000 })
    } catch (e) {
      lastErr = e
      if ((e.code === 'P2034' || e.code === 'P2028') && attempt < 2) continue
      throw e
    }
  }
  throw lastErr
}

async function loadOrderFull(orderId) {
  return prisma.p2POrder.findUnique({
    where: { id: orderId },
    include: {
      ad: { include: { merchant: true } },
      buyer: { include: { merchant: true } },
      seller: { include: { merchant: true } },
    },
  })
}

// --- merchant application ---

router.get('/merchant/me', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    res.json({ success: true, merchant: merchant || null })
  } catch (e) {
    next(e)
  }
})

router.post('/merchant/apply', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { businessName, contact, note } = req.body
    const name = String(businessName || '').trim()
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ success: false, error: 'businessName must be 2-60 characters' })
    }

    const existing = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    if (existing && existing.status === 'approved') {
      return res.status(400).json({ success: false, error: 'Already an approved merchant' })
    }

    const merchant = existing
      ? await prisma.merchant.update({
          where: { id: existing.id },
          data: { businessName: name, contact: contact || null, note: note || null, status: 'pending' },
        })
      : await prisma.merchant.create({
          data: { userId: req.user.id, businessName: name, contact: contact || null, note: note || null },
        })

    res.json({ success: true, merchant })
  } catch (e) {
    next(e)
  }
})

// --- public ad listing ---

router.get('/ads', authenticateToken, async (req, res, next) => {
  try {
    const side = ['buy', 'sell'].includes(req.query.side) ? req.query.side : undefined
    const where = { status: 'active', available: { gt: 0 } }
    if (side) where.side = side
    if (req.query.fiat) where.fiat = String(req.query.fiat).toUpperCase()

    const ads = await prisma.p2PAd.findMany({
      where,
      include: { merchant: true },
      orderBy: [{ side: 'asc' }, { price: 'asc' }],
      take: 100,
    })

    // Hide ads whose merchant is suspended or rejected, and drop bot ads with no payout account
    const visible = ads.filter(
      (a) => a.merchant.status === 'approved' && methodsOf(a.paymentMethods).length > 0
    )
    res.json({ success: true, ads: visible.map(toAdDto) })
  } catch (e) {
    next(e)
  }
})

// --- merchant ads ---

router.get('/merchant/ads', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    if (!merchant) return res.status(403).json({ success: false, error: 'Merchant only' })
    const ads = await prisma.p2PAd.findMany({ where: { merchantId: merchant.id }, include: { merchant: true }, orderBy: { createdAt: 'desc' } })
    res.json({ success: true, ads: ads.map(toAdDto) })
  } catch (e) {
    next(e)
  }
})

router.post('/merchant/ads', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    if (!merchant || merchant.status !== 'approved') {
      return res.status(403).json({ success: false, error: 'Merchant approval required' })
    }

    const { side, price, fiat, minAmount, maxAmount, available, paymentMethods, terms } = req.body
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ success: false, error: 'invalid side' })

    const p = num(price)
    const pmin = num(minAmount)
    const pmax = num(maxAmount)
    const avail = num(available)
    if (!(p > 0) || !(pmin > 0) || !(pmax >= pmin) || !(avail > 0)) {
      return res.status(400).json({ success: false, error: 'invalid price or amount range' })
    }
    if (avail > merchant.maxOrderGulu * 100) {
      return res.status(400).json({ success: false, error: 'available exceeds merchant limit' })
    }
    const methods = methodsOf(paymentMethods).filter((m) => m && m.type && m.account)
    if (!methods.length) return res.status(400).json({ success: false, error: 'at least one payment method required' })

    if (side === 'sell') {
      // Listing depth must be backed by free balance; otherwise the same GULU can back unlimited ads
      const check = await writeTx(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: req.user.id } })
        const open = await tx.p2PAd.aggregate({
          where: { merchantId: merchant.id, side: 'sell', status: { in: ['active', 'paused'] } },
          _sum: { available: true },
        })
        const committed = open._sum.available || 0
        if (!user || user.balance < committed + avail) return fail(400, 'Insufficient GULU balance')
        return { ok: true }
      })
      if (check.reject) return res.status(check.reject.status).json({ success: false, error: check.reject.error })
    }

    const ad = await prisma.p2PAd.create({
      data: {
        merchantId: merchant.id,
        side,
        price: p,
        fiat: String(fiat || 'CNY').toUpperCase(),
        minAmount: pmin,
        maxAmount: pmax,
        available: avail,
        paymentMethods: methods,
        terms: terms || null,
      },
      include: { merchant: true },
    })
    res.json({ success: true, ad: toAdDto(ad) })
  } catch (e) {
    next(e)
  }
})

router.patch('/merchant/ads/:id', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    if (!merchant) return res.status(403).json({ success: false, error: 'Merchant only' })

    const ad = await prisma.p2PAd.findFirst({ where: { id: req.params.id, merchantId: merchant.id } })
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' })

    const { status, price, minAmount, maxAmount, available, paymentMethods, terms } = req.body
    const data = {}
    if (status && ['active', 'paused', 'closed'].includes(status)) data.status = status
    if (price != null && num(price) > 0) data.price = num(price)
    if (minAmount != null && num(minAmount) > 0) data.minAmount = num(minAmount)
    if (maxAmount != null && num(maxAmount) > 0) data.maxAmount = num(maxAmount)
    if (available != null && num(available) >= 0) data.available = num(available)
    if (paymentMethods != null) {
      const methods = methodsOf(paymentMethods).filter((m) => m && m.type && m.account)
      if (!methods.length) return res.status(400).json({ success: false, error: 'at least one payment method required' })
      data.paymentMethods = methods
    }
    if (terms !== undefined) data.terms = terms || null

    const finalMin = data.minAmount != null ? data.minAmount : ad.minAmount
    const finalMax = data.maxAmount != null ? data.maxAmount : ad.maxAmount
    if (!(finalMax >= finalMin)) {
      return res.status(400).json({ success: false, error: 'max amount must be greater than or equal to min amount' })
    }

    const updated = await writeTx(async (tx) => {
      if (ad.side === 'sell' && data.available != null) {
        const open = await tx.p2PAd.aggregate({
          where: { id: { not: ad.id }, merchantId: merchant.id, side: 'sell', status: { in: ['active', 'paused'] } },
          _sum: { available: true },
        })
        const user = await tx.user.findUnique({ where: { id: merchant.userId } })
        if (!user || user.balance < (open._sum.available || 0) + data.available) {
          return fail(400, 'Available exceeds your GULU balance')
        }
      }
      return tx.p2PAd.update({ where: { id: ad.id }, data, include: { merchant: true } })
    })
    if (updated.reject) return res.status(updated.reject.status).json({ success: false, error: updated.reject.error })

    res.json({ success: true, ad: toAdDto(updated) })
  } catch (e) {
    next(e)
  }
})

router.delete('/merchant/ads/:id', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { userId: req.user.id } })
    if (!merchant) return res.status(403).json({ success: false, error: 'Merchant only' })
    const open = await prisma.p2POrder.count({ where: { adId: req.params.id, status: { in: ['pending_payment', 'paid', 'disputed'] } } })
    if (open > 0) return res.status(400).json({ success: false, error: 'Ad has open orders' })
    await prisma.p2PAd.updateMany({ where: { id: req.params.id, merchantId: merchant.id }, data: { status: 'closed', available: 0 } })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

// --- orders ---

router.post('/orders', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { adId, amount } = req.body
    const gulu = num(amount)
    if (!adId || !(gulu > 0) || gulu > 1e9) {
      return res.status(400).json({ success: false, error: 'invalid amount' })
    }

    const result = await writeTx(async (tx) => {
      const ad = await tx.p2PAd.findUnique({ where: { id: adId }, include: { merchant: true } })
      if (!ad || ad.status !== 'active') return fail(400, 'Ad is not available')
      if (ad.merchant.status !== 'approved') return fail(400, 'Merchant is not active')
      if (ad.merchant.userId === req.user.id) return fail(400, 'Cannot trade with yourself')

      const fiatAmount = +(gulu * ad.price).toFixed(2)
      if (fiatAmount < ad.minAmount || fiatAmount > ad.maxAmount) {
        return fail(400, `Order must be between ${ad.minAmount} and ${ad.maxAmount} ${ad.fiat}`)
      }
      if (ad.available < gulu) return fail(400, 'Ad has insufficient liquidity')
      if (gulu > ad.merchant.maxOrderGulu) return fail(400, `Single order limit is ${ad.merchant.maxOrderGulu} GULU`)
      if (ad.merchant.dailyLimitGulu > 0) {
        const since = new Date()
        since.setHours(0, 0, 0, 0)
        const today = await tx.p2POrder.aggregate({
          where: { sellerId: ad.merchant.userId, createdAt: { gte: since }, status: { in: ['pending_payment', 'paid', 'disputed', 'completed'] } },
          _sum: { amount: true },
        })
        if ((today._sum.amount || 0) + gulu > ad.merchant.dailyLimitGulu) {
          return fail(400, 'Merchant daily limit reached')
        }
      }

      const buyerId = ad.side === 'sell' ? req.user.id : ad.merchant.userId
      const sellerId = ad.side === 'sell' ? ad.merchant.userId : req.user.id

      const seller = await tx.user.findUnique({ where: { id: sellerId } })
      if (!seller || seller.balance < gulu) return fail(400, 'Seller has insufficient GULU')

      await tx.user.update({
        where: { id: sellerId },
        data: { balance: { decrement: gulu }, locked: { increment: gulu } },
      })

      const nextAvailable = +(ad.available - gulu).toFixed(8)
      await tx.p2PAd.update({
        where: { id: ad.id },
        data: { available: nextAvailable, ...(nextAvailable <= 0 ? { status: 'paused' } : {}) },
      })

      const order = await tx.p2POrder.create({
        data: { adId: ad.id, buyerId, sellerId, amount: gulu, price: ad.price, fiatAmount, fiat: ad.fiat },
      })

      await tx.transaction.create({
        data: {
          userId: sellerId,
          type: 'p2p_escrow',
          amount: -gulu,
          balanceBefore: seller.balance,
          balanceAfter: seller.balance - gulu,
          reason: `p2p escrow ${gulu} GULU for order ${order.id}`,
          ts: BigInt(Date.now()),
        },
      })

      return { orderId: order.id }
    })

    if (result.reject) return res.status(result.reject.status).json({ success: false, error: result.reject.error })

    const order = await loadOrderFull(result.orderId)
    const io = req.app.get('io')
    if (io) {
      io.to(`user-${order.buyerId}`).emit('p2p:order', { orderId: order.id, status: order.status })
      io.to(`user-${order.sellerId}`).emit('p2p:order', { orderId: order.id, status: order.status })
    }
    res.json({ success: true, order: toOrderDto(order, req.user.id) })
  } catch (e) {
    next(e)
  }
})

router.get('/orders', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const role = req.query.role
    const where =
      role === 'buyer' ? { buyerId: req.user.id } : role === 'seller' ? { sellerId: req.user.id } : { OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }] }
    const orders = await prisma.p2POrder.findMany({
      where,
      include: {
        ad: { include: { merchant: true } },
        buyer: { include: { merchant: true } },
        seller: { include: { merchant: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({ success: true, orders: orders.map((o) => toOrderDto(o, req.user.id)) })
  } catch (e) {
    next(e)
  }
})

router.post('/orders/:id/pay', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { method, ref } = req.body
    // Conditional write: a concurrent cancel or dispute must not be overwritten by a stale "pending" read
    const result = await writeTx(async (tx) => {
      const order = await tx.p2POrder.findUnique({ where: { id: req.params.id } })
      if (!order) return fail(404, 'Order not found')
      if (order.buyerId !== req.user.id) return fail(403, 'Buyer only')

      const moved = await tx.p2POrder.updateMany({
        where: { id: order.id, buyerId: req.user.id, status: 'pending_payment' },
        data: { status: 'paid', paidAt: new Date(), paymentMethod: method || null, paymentRef: ref || null },
      })
      if (moved.count === 0) return fail(400, 'Order is not awaiting payment')
      return { id: order.id }
    })
    if (result.reject) return res.status(result.reject.status).json({ success: false, error: result.reject.error })

    const full = await loadOrderFull(result.id)
    const io = req.app.get('io')
    if (io) {
      io.to(`user-${full.sellerId}`).emit('p2p:order', { orderId: full.id, status: 'paid' })
      io.to(`user-${full.buyerId}`).emit('p2p:order', { orderId: full.id, status: 'paid' })
    }
    res.json({ success: true, order: toOrderDto(full, req.user.id) })
  } catch (e) {
    next(e)
  }
})

// Moves escrowed GULU from seller to buyer; shared by seller release and admin resolution
async function settleOrder(orderId, actor) {
  return writeTx(async (tx) => {
    const order = await tx.p2POrder.findUnique({ where: { id: orderId }, include: { ad: { include: { merchant: true } } } })
    if (!order) return fail(404, 'Order not found')
    if (!['paid', 'disputed'].includes(order.status)) return fail(400, 'Order cannot be completed')

    const seller = await tx.user.findUnique({ where: { id: order.sellerId } })
    if (!seller || seller.locked < order.amount) return fail(400, 'Escrow is inconsistent')

    // Claim after validating: a failed check must not leave the order marked completed
    const claimed = await tx.p2POrder.updateMany({
      where: { id: orderId, status: { in: ['paid', 'disputed'] } },
      data: { status: 'completed', completedAt: new Date() },
    })
    if (claimed.count === 0) return fail(400, 'Order cannot be completed')

    const buyer = await tx.user.findUnique({ where: { id: order.buyerId } })
    const buyerBefore = buyer.balance

    await tx.user.update({
      where: { id: order.sellerId },
      data: { locked: { decrement: order.amount } },
    })
    await tx.user.update({
      where: { id: order.buyerId },
      data: { balance: { increment: order.amount } },
    })
    await tx.merchant.update({
      where: { id: order.ad.merchantId },
      data: { completedOrders: { increment: 1 } },
    })

    await tx.transaction.create({
      data: {
        userId: order.buyerId,
        type: 'p2p_release',
        amount: order.amount,
        balanceBefore: buyerBefore,
        balanceAfter: buyerBefore + order.amount,
        reason: `p2p released ${order.amount} GULU by ${actor}`,
        ts: BigInt(Date.now()),
      },
    })

    return { order }
  })
}

async function refundOrder(orderId, actor, reason, { allowPaid = false } = {}) {
  return writeTx(async (tx) => {
    const order = await tx.p2POrder.findUnique({ where: { id: orderId }, include: { ad: true } })
    if (!order) return fail(404, 'Order not found')

    // Cancelling a paid order would let the buyer claim a refund and still dispute the payment
    const cancellable = allowPaid ? ['pending_payment', 'paid', 'disputed'] : ['pending_payment']
    if (!cancellable.includes(order.status)) {
      return fail(400, allowPaid ? 'Order cannot be cancelled' : 'Order already paid, open a dispute instead')
    }

    const seller = await tx.user.findUnique({ where: { id: order.sellerId } })
    if (!seller || seller.locked < order.amount) return fail(400, 'Escrow is inconsistent')

    // Claim after validating: a failed check must not leave the order marked cancelled
    const claimed = await tx.p2POrder.updateMany({
      where: { id: orderId, status: { in: cancellable } },
      data: { status: 'cancelled', cancelReason: reason || null },
    })
    if (claimed.count === 0) return fail(400, allowPaid ? 'Order cannot be cancelled' : 'Order already paid, open a dispute instead')

    await tx.user.update({
      where: { id: order.sellerId },
      data: { locked: { decrement: order.amount }, balance: { increment: order.amount } },
    })
    // Closed ads stay closed; only live ads get their displayed liquidity back
    if (order.ad.status !== 'closed') {
      await tx.p2PAd.update({
        where: { id: order.adId },
        data: { available: { increment: order.amount }, status: 'active' },
      })
    }
    await tx.transaction.create({
      data: {
        userId: order.sellerId,
        type: 'p2p_refund',
        amount: order.amount,
        balanceBefore: seller.balance,
        balanceAfter: seller.balance + order.amount,
        reason: `p2p refund ${order.amount} GULU (${actor})`,
        ts: BigInt(Date.now()),
      },
    })

    return { order }
  })
}

router.post('/orders/:id/release', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const order = await prisma.p2POrder.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
    if (order.sellerId !== req.user.id) return res.status(403).json({ success: false, error: 'Seller only' })

    const result = await settleOrder(order.id, req.user.email)
    if (result.reject) return res.status(result.reject.status).json({ success: false, error: result.reject.error })

    const full = await loadOrderFull(order.id)
    const io = req.app.get('io')
    if (io) {
      io.to(`user-${full.buyerId}`).emit('p2p:order', { orderId: full.id, status: 'completed' })
      io.to(`user-${full.sellerId}`).emit('p2p:order', { orderId: full.id, status: 'completed' })
      io.to(`user-${full.buyerId}`).emit('balance:update', {})
    }
    res.json({ success: true, order: toOrderDto(full, req.user.id) })
  } catch (e) {
    next(e)
  }
})

router.post('/orders/:id/cancel', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const order = await prisma.p2POrder.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
    const isParty = order.buyerId === req.user.id || order.sellerId === req.user.id
    if (!isParty) return res.status(403).json({ success: false, error: 'Not your order' })
    // Once a buyer claims payment, only an admin may cancel
    if (order.status !== 'pending_payment') {
      return res.status(400).json({ success: false, error: 'Order already paid, open a dispute instead' })
    }

    const result = await refundOrder(order.id, req.user.email, req.body?.reason)
    if (result.reject) return res.status(result.reject.status).json({ success: false, error: result.reject.error })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.post('/orders/:id/dispute', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const order = await prisma.p2POrder.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
    if (order.buyerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not your order' })
    }
    if (order.status !== 'paid') return res.status(400).json({ success: false, error: 'Only paid orders can be disputed' })

    // Guarded transition: a concurrent release may already have completed the order
    const moved = await prisma.p2POrder.updateMany({
      where: { id: order.id, status: 'paid' },
      data: { status: 'disputed', cancelReason: req.body?.reason || null },
    })
    if (moved.count === 0) return res.status(400).json({ success: false, error: 'Order is no longer disputable' })
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

module.exports = router
module.exports.settleOrder = settleOrder
module.exports.refundOrder = refundOrder
module.exports.toOrderDto = toOrderDto
module.exports.loadOrderFull = loadOrderFull
