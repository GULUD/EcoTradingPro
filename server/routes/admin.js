const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

const toUserDto = (u) => ({
  _id: u.id,
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  balance: u.balance,
  isActive: u.isActive,
  lastLogin: u.lastLogin,
  createdAt: u.createdAt,
})

const toNewsDto = (n) => ({ ...n, _id: n.id })

router.get('/users', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(users.map(toUserDto))
  } catch (e) {
    next(e)
  }
})

router.put('/users/:userId/balance', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { balance } = req.body
    if (!Number.isFinite(balance) || balance < 0) {
      return res.status(400).json({ success: false, error: 'Invalid balance amount' })
    }
    const target = +balance.toFixed(8)

    // Applied as a delta inside one serializable transaction so concurrent fills are not overwritten
    const adjust = () =>
      prisma.$transaction(
        async (tx) => {
          const cur = await tx.user.findUnique({ where: { id: userId } })
          if (!cur) return null
          const delta = +(target - cur.balance).toFixed(8)
          const u = await tx.user.update({ where: { id: userId }, data: { balance: { increment: delta } } })

          await tx.transaction.create({
            data: {
              userId,
              type: 'admin_adjust',
              amount: delta,
              balanceBefore: cur.balance,
              balanceAfter: u.balance,
              reason: 'admin set balance',
              operator: req.user.email,
              ts: BigInt(Date.now()),
            },
          })

          // Supply is derived from issuance records, so a manual adjustment must
          // be booked like a mint or burn or the totals drift away from balances
          if (Math.abs(delta) > 1e-9) {
            await tx.guluIssue.create({
              data: {
                type: delta > 0 ? 'mint' : 'burn',
                amount: Math.abs(delta),
                userId,
                operator: req.user.email,
                note: 'admin set balance',
                ts: BigInt(Date.now()),
              },
            })
          }
          return u
        },
        { isolationLevel: 'Serializable' }
      )

    let updated
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        updated = await adjust()
        break
      } catch (e) {
        if (e.code === 'P2034' && attempt === 0) continue
        throw e
      }
    }
    if (!updated) return res.status(404).json({ success: false, error: 'User not found' })

    const io = req.app.get('io')
    if (io) {
      io.to(`user-${userId}`).emit('balance:update', { balance: updated.balance })
      io.to(`user-${userId}`).emit('balance-update', {
        message: `Your balance has been updated to ${updated.balance.toFixed(2)}.`,
        newBalance: updated.balance,
      })
    }

    res.json(toUserDto(updated))
  } catch (e) {
    next(e)
  }
})

router.put('/users/:userId/status', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isActive must be boolean' })
    }
    const exists = await prisma.user.findUnique({ where: { id: userId } })
    if (!exists) return res.status(404).json({ success: false, error: 'User not found' })

    const updated = await prisma.user.update({ where: { id: userId }, data: { isActive } })
    const io = req.app.get('io')
    if (io) {
      io.to(`user-${userId}`).emit('status-update', {
        message: `Your account status has been updated to ${isActive ? 'Active' : 'Inactive'}.`,
        isActive,
      })
    }
    res.json(toUserDto(updated))
  } catch (e) {
    next(e)
  }
})

router.get('/stats', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const [totalUsers, activeUsers, aggregate] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.aggregate({ _sum: { balance: true } }),
    ])
    res.json({
      totalUsers,
      activeUsers,
      totalBalance: aggregate._sum.balance || 0,
      systemUptime: process.uptime(),
    })
  } catch (e) {
    next(e)
  }
})

router.post('/news', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, author, category, priority, isPublished } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'title required' })
    const news = await prisma.news.create({
      data: {
        title,
        content: content || '',
        author: author || req.user.name,
        category: category || null,
        priority: Number.isFinite(+priority) ? +priority : 0,
        isPublished: isPublished !== false,
      },
    })
    res.status(201).json(toNewsDto(news))
  } catch (e) {
    next(e)
  }
})

router.get('/news', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const news = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(news.map(toNewsDto))
  } catch (e) {
    next(e)
  }
})

router.get('/news/:newsId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const news = await prisma.news.findUnique({ where: { id: req.params.newsId } })
    if (!news) return res.status(404).json({ success: false, message: 'News not found' })
    res.json(toNewsDto(news))
  } catch (e) {
    next(e)
  }
})

router.put('/news/:newsId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, isPublished, category, priority } = req.body
    const data = {}
    if (title !== undefined) data.title = title
    if (content !== undefined) data.content = content
    if (isPublished !== undefined) data.isPublished = isPublished
    if (category !== undefined) data.category = category
    if (priority !== undefined) data.priority = +priority

    const news = await prisma.news.update({ where: { id: req.params.newsId }, data })
    res.json(toNewsDto(news))
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'News not found' })
    next(e)
  }
})

router.patch('/news/:newsId/publish', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { isPublished } = req.body
    const news = await prisma.news.update({
      where: { id: req.params.newsId },
      data: { isPublished: isPublished !== false },
    })
    res.json(toNewsDto(news))
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'News not found' })
    next(e)
  }
})

router.delete('/news/:newsId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    await prisma.news.delete({ where: { id: req.params.newsId } })
    res.json({ success: true, message: 'News article deleted successfully' })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'News not found' })
    next(e)
  }
})

module.exports = router
