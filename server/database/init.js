const prisma = require('../db')

const COINS = [
  { symbol: 'BTC', name: 'Bitcoin', price: 68355, volatility: 1.2, decimals: 2 },
  { symbol: 'ETH', name: 'Ethereum', price: 3210, volatility: 1.6, decimals: 2 },
  { symbol: 'SOL', name: 'Solana', price: 182.4, volatility: 2.4, decimals: 2 },
  { symbol: 'ADA', name: 'Cardano', price: 0.52, volatility: 2.8, decimals: 4 },
  { symbol: 'XRP', name: 'Ripple', price: 0.62, volatility: 2.6, decimals: 4 },
  { symbol: 'BNB', name: 'Binance Coin', price: 598.3, volatility: 1.8, decimals: 2 },
  { symbol: 'MATIC', name: 'Polygon', price: 0.72, volatility: 3.0, decimals: 4 },
  { symbol: 'DOT', name: 'Polkadot', price: 6.8, volatility: 2.5, decimals: 3 },
  { symbol: 'LINK', name: 'Chainlink', price: 13.4, volatility: 2.2, decimals: 3 },
  { symbol: 'UNI', name: 'Uniswap', price: 8.9, volatility: 2.7, decimals: 3 },
]

const NEWS = [
  {
    title: 'Bitcoin holds above prior resistance',
    content: 'Bitcoin price action remains constructive after reclaiming its previous range high.',
    author: 'CryptoNews Team',
    category: 'Market Analysis',
  },
  {
    title: 'Ethereum staking rewards update',
    content: 'Validator rewards adjust with the latest network upgrade.',
    author: 'DeFi Analyst',
    category: 'Technology',
  },
  {
    title: 'Regulatory clarity boosts crypto markets',
    content: 'New guidelines give the industry a clearer compliance path.',
    author: 'Regulatory Expert',
    category: 'Regulation',
  },
]

const ANNOUNCEMENTS = [
  {
    title: 'Welcome to EcoTradingPro',
    content: 'Deposit funds and trade spot markets with a live central limit order book.',
    type: 'info',
  },
  {
    title: 'New features available',
    content: 'Real-time order book, live trade tape and advanced charting are now online.',
    type: 'update',
  },
]

async function seedMarketData() {
  for (const c of COINS) {
    // update:{} keeps admin controlled prices from being reset on every deploy
    await prisma.marketData.upsert({
      where: { symbol: c.symbol },
      update: {},
      create: {
        ...c,
        manualPrice: c.price,
        open24h: c.price,
        autoSync: true,
      },
    })
  }
}

async function seedContent() {
  const newsCount = await prisma.news.count()
  if (newsCount === 0) {
    for (const n of NEWS) {
      await prisma.news.create({ data: n })
    }
    console.log('[seed] news created')
  }

  const announcementCount = await prisma.announcement.count()
  if (announcementCount === 0) {
    for (const a of ANNOUNCEMENTS) {
      await prisma.announcement.create({ data: a })
    }
    console.log('[seed] announcements created')
  }
}

async function seedAll() {
  await seedMarketData()
  await seedContent()
  console.log('[seed] market and content ready')
}

module.exports = { seedAll, seedMarketData, seedContent, COINS }
