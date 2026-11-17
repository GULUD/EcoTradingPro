const prisma = require('../db')

class PortfolioService {
  async loadPrices() {
    const coins = await prisma.marketData.findMany({ where: { delisted: false } })
    const map = {}
    for (const c of coins) {
      map[c.symbol] = { price: c.manualPrice ?? c.price, change24h: c.change24h, volume24h: c.volume24h }
    }
    return map
  }

  async calculatePortfolioValue(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new Error('User not found')

    const prices = await this.loadPrices()
    const portfolio = user.portfolio || {}
    let totalValue = user.balance || 0
    const holdings = []

    for (const [asset, quantity] of Object.entries(portfolio)) {
      if (quantity > 0) {
        const marketPrice = prices[asset]?.price || 0
        const value = quantity * marketPrice
        totalValue += value
        holdings.push({ asset, quantity, marketPrice, value, allocation: 0 })
      }
    }

    holdings.forEach((h) => {
      h.allocation = totalValue > 0 ? (h.value / totalValue) * 100 : 0
    })

    return {
      totalValue: +totalValue.toFixed(2),
      cashBalance: user.balance || 0,
      holdings,
      lastUpdated: new Date(),
    }
  }

  async calculatePerformanceMetrics(userId, timeRange = 30) {
    const portfolio = await this.calculatePortfolioValue(userId)
    const since = BigInt(Date.now() - timeRange * 24 * 60 * 60 * 1000)
    const trades = await prisma.trade.findMany({
      where: { userId, source: 'user', time: { gte: since } },
    })

    const initialBalance = 10000
    const totalReturn = ((portfolio.totalValue - initialBalance) / initialBalance) * 100
    const totalPnL = portfolio.totalValue - initialBalance
    const sells = trades.filter((t) => t.side === 'sell')
    const wins = sells.filter((t) => t.pnl > 0)
    const winRate = sells.length > 0 ? (wins.length / sells.length) * 100 : 0

    return {
      totalReturn: +totalReturn.toFixed(2),
      totalPnL: +totalPnL.toFixed(2),
      winRate: +winRate.toFixed(2),
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: sells.length - wins.length,
      volatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      lastUpdated: new Date(),
    }
  }

  async getRiskMetrics(userId) {
    const portfolio = await this.calculatePortfolioValue(userId)
    const holdings = portfolio.holdings
    return {
      var95: 0,
      concentrationRisk: holdings.length ? Math.max(...holdings.map((h) => h.allocation)) : 0,
      correlationRisk: holdings.length > 3 ? 'Low' : holdings.length > 1 ? 'Medium' : 'High',
      leverageRatio: 1.0,
      betaToMarket: 1,
      trackingError: 0,
      lastUpdated: new Date(),
    }
  }

  async getPortfolioComposition(userId) {
    const portfolio = await this.calculatePortfolioValue(userId)
    const prices = await this.loadPrices()

    return {
      byAsset: portfolio.holdings.map((h) => ({
        asset: h.asset,
        allocation: h.allocation,
        value: h.value,
        quantity: h.quantity,
        marketPrice: h.marketPrice,
        change24h: prices[h.asset]?.change24h || 0,
      })),
      byMarketCap: { largeCap: 0, midCap: 0, smallCap: 0 },
      cashAllocation: portfolio.totalValue > 0 ? (portfolio.cashBalance / portfolio.totalValue) * 100 : 100,
    }
  }
}

module.exports = new PortfolioService()
