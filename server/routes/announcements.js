const express = require('express')
const prisma = require('../db')
const { authenticateToken, requireAdmin, optionalUser } = require('../middleware/auth')

const router = express.Router()

router.get('/', optionalUser, async (req, res, next) => {
  try {
    const now = new Date()
    // Targeted announcements must stay private; anonymous callers only see the public ones
    const targets = ['all']
    if (req.user) targets.push(req.user.id, req.user.email)
    const rows = await prisma.announcement.findMany({
      where: {
        active: true,
        targetUsers: { in: targets },
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

// Admin listing includes inactive and expired rows so the operator can audit them
router.get('/admin', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const rows = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    res.json(rows)
  } catch (e) {
    next(e)
  }
})

const TYPES = ['info', 'update', 'warning']
const PRIORITIES = ['low', 'medium', 'high']

router.post('/', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { title, content, type, priority, expiresAt, targetUsers } = req.body
    const name = String(title || '').trim()
    if (name.length < 3 || name.length > 120) {
      return res.status(400).json({ success: false, message: 'title must be 3-120 characters' })
    }
    // An unparseable date reaches Prisma as Invalid Date and turns into a 500
    let expires = null
    if (expiresAt) {
      expires = new Date(expiresAt)
      if (!Number.isFinite(expires.getTime())) {
        return res.status(400).json({ success: false, message: 'expiresAt must be a valid date' })
      }
    }
    const announcement = await prisma.announcement.create({
      data: {
        title: name,
        content: content || '',
        type: TYPES.includes(type) ? type : 'info',
        priority: PRIORITIES.includes(priority) ? priority : 'medium',
        targetUsers: targetUsers || 'all',
        expiresAt: expires,
      },
    })
    res.status(201).json({ success: true, announcement })
  } catch (e) {
    next(e)
  }
})

router.patch('/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const data = {}
    if (typeof req.body.active === 'boolean') data.active = req.body.active
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, message: 'active is required' })
    }
    const announcement = await prisma.announcement.update({ where: { id: req.params.id }, data })
    res.json({ success: true, announcement })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ success: false, message: 'Announcement not found' })
    next(e)
  }
})

module.exports = router
