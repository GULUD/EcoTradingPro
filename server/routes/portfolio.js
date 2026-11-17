const express = require('express')
const portfolioService = require('../services/portfolioService')
const { authenticateToken, requireUser } = require('../middleware/auth')

const router = express.Router()

router.get('/value', authenticateToken, requireUser, async (req, res, next) => {
  try {
    res.json(await portfolioService.calculatePortfolioValue(req.user.id))
  } catch (e) {
    next(e)
  }
})

router.get('/performance', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { timeRange = 30 } = req.query
    const days = Math.min(365, Math.max(1, parseInt(timeRange, 10) || 30))
    res.json(await portfolioService.calculatePerformanceMetrics(req.user.id, days))
  } catch (e) {
    next(e)
  }
})

router.get('/risk', authenticateToken, requireUser, async (req, res, next) => {
  try {
    res.json(await portfolioService.getRiskMetrics(req.user.id))
  } catch (e) {
    next(e)
  }
})

router.get('/composition', authenticateToken, requireUser, async (req, res, next) => {
  try {
    res.json(await portfolioService.getPortfolioComposition(req.user.id))
  } catch (e) {
    next(e)
  }
})

router.get('/report', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { timeRange = 30 } = req.query
    const days = Math.min(365, Math.max(1, parseInt(timeRange, 10) || 30))
    const [portfolio, performance, risk, composition] = await Promise.all([
      portfolioService.calculatePortfolioValue(req.user.id),
      portfolioService.calculatePerformanceMetrics(req.user.id, days),
      portfolioService.getRiskMetrics(req.user.id),
      portfolioService.getPortfolioComposition(req.user.id),
    ])
    res.json({
      summary: {
        totalValue: portfolio.totalValue,
        totalReturn: performance.totalReturn,
        sharpeRatio: performance.sharpeRatio,
        maxDrawdown: performance.maxDrawdown,
        winRate: performance.winRate,
      },
      portfolio,
      performance,
      risk,
      composition,
      generatedAt: new Date(),
    })
  } catch (e) {
    next(e)
  }
})

module.exports = router
