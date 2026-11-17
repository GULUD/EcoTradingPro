const express = require('express')
const botEngine = require('../services/botEngine')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

const MODES = ['ramp', 'surge', 'stair', 'dump', 'walk']

function expand(cfg) {
  const n = Math.max(1, Math.min(20, cfg.count ?? 1))
  return Array.from({ length: n }, () => ({
    symbol: cfg.symbol,
    target: +cfg.target,
    mode: cfg.mode || 'ramp',
    speed: +(cfg.speed ?? 1),
    intervalMs: +(cfg.intervalMs ?? 3000),
    avgSize: +(cfg.avgSize ?? 1),
    intensity: +(cfg.intensity ?? 0.6),
    tolerance: +(cfg.tolerance ?? 0.005),
    counterRate: +(cfg.counterRate ?? 0.2),
    name: cfg.name || undefined,
  }))
}

router.post('/bot-groups', authenticateToken, requireAdmin, (req, res) => {
  const cfg = req.body
  const bots = Array.isArray(cfg.bots) ? cfg.bots.flatMap(expand) : expand(cfg)
  if (!bots.length) return res.status(400).json({ success: false, message: 'no bot config' })
  for (const b of bots) {
    if (!b.symbol || b.target == null) {
      return res.status(400).json({ success: false, message: 'each item needs symbol and target' })
    }
    if (!MODES.includes(b.mode)) {
      return res.status(400).json({ success: false, message: `invalid mode: ${b.mode}` })
    }
  }
  const id = botEngine.startGroup(req.app.get('io'), { ...cfg, bots })
  res.json({ success: true, groupId: id, count: bots.length })
})

router.patch('/bot-groups/bots/:botId', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: botEngine.updateBot(req.params.botId, req.body) })
})

router.delete('/bot-groups/:id', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: botEngine.stopGroup(req.params.id) })
})

router.post('/bot-groups/stop-all', authenticateToken, requireAdmin, (req, res) => {
  botEngine.stopAll()
  console.log('[bot] all groups stopped by', req.user.email)
  res.json({ success: true, stopped: true })
})

router.get('/bot-groups/status', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, groups: botEngine.status() })
})

module.exports = router
