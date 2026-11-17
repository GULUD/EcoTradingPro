const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../db')
const { settleOrder } = require('../routes/p2p')

const BOT_SEED = [
  { email: 'bot-desk-1@gulu.local', business: 'GULU Official Desk', price: 7.18, available: 8000 },
  { email: 'bot-desk-2@gulu.local', business: 'GULU Merchant Pool', price: 7.24, available: 6000 },
]

// Bots exist so a fresh venue is never empty; their payout accounts stay blank until an admin fills them
async function seedBots() {
  for (const b of BOT_SEED) {
    let user = await prisma.user.findUnique({ where: { email: b.email } })
    if (!user) {
      const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
      user = await prisma.user.create({
        data: { firstName: 'GULU', lastName: 'Desk', email: b.email, password, isActive: false, balance: 0 },
      })
      console.log('[seed] p2p bot user created', b.email)
    }

    let merchant = await prisma.merchant.findUnique({ where: { userId: user.id } })
    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          userId: user.id,
          businessName: b.business,
          contact: 'platform',
          status: 'approved',
          isBot: true,
          maxOrderGulu: 2000,
          dailyLimitGulu: 20000,
        },
      })
      console.log('[seed] p2p bot merchant created', b.business)
    }

    const inventory = b.available * 2
    if (user.balance < inventory) {
      const amount = inventory - user.balance
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { balance: { increment: amount } } }),
        prisma.guluIssue.create({
          data: { type: 'mint', amount, userId: user.id, operator: 'seed', note: 'p2p bot inventory', ts: BigInt(Date.now()) },
        }),
      ])
    }

    const ad = await prisma.p2PAd.findFirst({ where: { merchantId: merchant.id, side: 'sell', status: { not: 'closed' } } })
    if (!ad) {
      await prisma.p2PAd.create({
        data: {
          merchantId: merchant.id,
          side: 'sell',
          price: b.price,
          fiat: 'CNY',
          minAmount: 10,
          maxAmount: b.available,
          available: b.available,
          paymentMethods: [],
          terms: 'Pay with the account shown after the order is created.',
          autoRelease: true,
        },
      })
      console.log('[seed] p2p bot ad created', b.business)
    }
  }
}

// Bot merchants confirm receipt automatically; the delay leaves room for a dispute
async function autoReleaseTick(io) {
  const cutoff = new Date(Date.now() - 20000)
  const due = await prisma.p2POrder.findMany({
    where: { status: 'paid', paidAt: { lte: cutoff }, ad: { autoRelease: true } },
    select: { id: true, buyerId: true, sellerId: true },
    take: 20,
  })

  for (const o of due) {
    try {
      const r = await settleOrder(o.id, 'bot')
      if (!r.reject && io) {
        io.to(`user-${o.buyerId}`).emit('p2p:order', { orderId: o.id, status: 'completed' })
        io.to(`user-${o.sellerId}`).emit('p2p:order', { orderId: o.id, status: 'completed' })
      }
    } catch (e) {
      console.error('[p2p] auto release failed:', o.id, e.message)
    }
  }
}

module.exports = { seedBots, autoReleaseTick }
