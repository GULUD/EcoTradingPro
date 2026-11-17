const express = require('express')
const prisma = require('../db')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query
    const where = { isPublished: true }
    if (category && category !== 'all') where.category = category

    const news = await prisma.news.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: parseInt(limit),
      skip: parseInt(offset),
    })
    res.json(news.map((n) => ({ ...n, _id: n.id })))
  } catch (e) {
    next(e)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const news = await prisma.news.findFirst({ where: { id: req.params.id, isPublished: true } })
    if (!news) return res.status(404).json({ success: false, error: 'Article not found' })

    const updated = await prisma.news.update({
      where: { id: news.id },
      data: { views: { increment: 1 } },
    })
    res.json({ ...updated, _id: updated.id })
  } catch (e) {
    next(e)
  }
})

module.exports = router
