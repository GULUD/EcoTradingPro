const express = require('express')
const prisma = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

const MOCK_COMPETITIONS = [
  {
    id: '1',
    title: 'Weekly Crypto Challenge',
    description: 'Trade cryptocurrencies for the highest return in 7 days',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-02-08'),
    participants: 245,
    maxParticipants: 500,
    entryFee: 0,
    prizePool: 5000,
    startingBalance: 10000,
    status: 'active',
    category: 'general',
    rules: [
      'Starting balance: 10000 virtual money',
      'All major cryptocurrencies allowed',
      'No leverage trading',
      'Competition ends at midnight UTC',
    ],
    prizes: { 1: 2000, 2: 1500, 3: 1000, '4-10': 500 },
  },
]

router.get('/', authenticateToken, (req, res) => {
  res.json(MOCK_COMPETITIONS)
})

router.post('/:competitionId/join', authenticateToken, async (req, res, next) => {
  try {
    // Re-read inside the transaction so two parallel joins cannot overwrite each other
    const joined = await prisma.$transaction(
      async (tx) => {
        const u = await tx.user.findUnique({ where: { id: req.user.id } })
        const list = Array.isArray(u.competitions) ? u.competitions : []
        if (list.some((c) => c.competitionId === req.params.competitionId)) return false
        list.push({
          competitionId: req.params.competitionId,
          joinedAt: new Date().toISOString(),
          startingBalance: 10000,
          currentBalance: 10000,
          trades: [],
        })
        await tx.user.update({ where: { id: req.user.id }, data: { competitions: list } })
        return true
      },
      { isolationLevel: 'Serializable' }
    )
    if (!joined) {
      return res.status(400).json({ success: false, error: 'Already joined this competition' })
    }
    res.json({ success: true })
  } catch (e) {
    next(e)
  }
})

router.get('/:competitionId/leaderboard', authenticateToken, (req, res) => {
  res.json([
    { rank: 1, name: 'CryptoPro', balance: 15234.56, profit: 5234.56, profitPercent: 52.3 },
    { rank: 2, name: 'TradeKing', balance: 14892.33, profit: 4892.33, profitPercent: 48.9 },
    { rank: 3, name: 'MoonTrader', balance: 13567.89, profit: 3567.89, profitPercent: 35.7 },
  ])
})

module.exports = router
