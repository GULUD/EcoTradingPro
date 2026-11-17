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
    res.json(await portfolioService.calculatePerformanceMetrics(req.user.id, parseInt(timeRange)))
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
    const [portfolio, performance, risk, composition] = await Promise.all([
      portfolioService.calculatePortfolioValue(req.user.id),
      portfolioService.calculatePerformanceMetrics(req.user.id, parseInt(timeRange)),
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
