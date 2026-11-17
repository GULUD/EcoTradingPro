const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const now = new Date()
    const rows = await prisma.announcement.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    res.json(rows)
  } catch (e) {
    next(e)
  }
})

router.post('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, type, priority, expiresAt, targetUsers } = req.body
    if (!title) {
      return res.status(400).json({ success: false, message: 'title required' })
    }
    const announcement = await prisma.announcement.create({
      data: {
        title,
        content: content || '',
        type: type || 'info',
        priority: priority || 'medium',
        targetUsers: targetUsers || 'all',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })
    res.status(201).json({ success: true, announcement })
  } catch (e) {
    next(e)
  }
})

module.exports = router
