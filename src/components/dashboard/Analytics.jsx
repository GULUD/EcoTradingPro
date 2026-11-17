import React, { useEffect, useState } from 'react'
import { useWebSocket } from '../../contexts/WebSocketContext'
import axios from '../../utils/axios'

const EMPTY = 'No data yet'

const fmtAmount = (value, digits = 2) =>
  Number.isFinite(Number(value))
    ? Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
    : null

const fmtGulu = (value, digits = 2) => {
  const formatted = fmtAmount(value, digits)
  return formatted === null ? EMPTY : `${formatted} GULU`
}

const fmtPercent = (value, digits = 2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return EMPTY
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`
}

function Analytics() {
  const { marketData } = useWebSocket()
  const [timeframe, setTimeframe] = useState('30d')
  const [portfolioValue, setPortfolioValue] = useState(null)
  const [performance, setPerformance] = useState(null)
  const [risk, setRisk] = useState(null)
  const [composition, setComposition] = useState(null)
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const days = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }[timeframe] || 30

    setLoading(true)
    Promise.allSettled([
      axios.get('/api/portfolio/value'),
      axios.get('/api/portfolio/performance', { params: { timeRange: days } }),
      axios.get('/api/portfolio/risk'),
      axios.get('/api/portfolio/composition'),
      axios.get('/api/users/trades'),
    ]).then(([valueRes, perfRes, riskRes, compositionRes, tradesRes]) => {
      if (cancelled) return
      setPortfolioValue(valueRes.status === 'fulfilled' ? valueRes.value.data : null)
      setPerformance(perfRes.status === 'fulfilled' ? perfRes.value.data : null)
      setRisk(riskRes.status === 'fulfilled' ? riskRes.value.data : null)
      setComposition(compositionRes.status === 'fulfilled' ? compositionRes.value.data : null)
      setTrades(
        tradesRes.status === 'fulfilled' && Array.isArray(tradesRes.value.data)
          ? tradesRes.value.data
          : []
      )
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [timeframe])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  const holdings = composition?.byAsset || portfolioValue?.holdings || []
  const totalTrades = Number(performance?.totalTrades) || 0
  const closedCount = (Number(performance?.winningTrades) || 0) + (Number(performance?.losingTrades) || 0)
  const hasTrades = totalTrades > 0
  const hasClosedTrades = closedCount > 0
  // Best/worst must use closed sells inside the selected window; buys carry no P&L
  const windowStart = Date.now() - ({ '1d': 1, '7d': 7, '30d': 30, '90d': 90 }[timeframe] || 30) * 86400000
  const pnlTrades = trades.filter(
    (trade) => trade.side === 'sell' && Number(trade.time) >= windowStart && Number.isFinite(Number(trade.pnl))
  )
  const bestTrade = pnlTrades.reduce(
    (best, trade) => (best === null || Number(trade.pnl) > Number(best.pnl) ? trade : best),
    null
  )
  const worstTrade = pnlTrades.reduce(
    (worst, trade) => (worst === null || Number(trade.pnl) < Number(worst.pnl) ? trade : worst),
    null
  )
  const marketEntries = Object.entries(marketData).slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Analytics &amp; Performance</h2>
          <p className="text-gray-500 mt-1">Live account metrics from your portfolio</p>
        </div>
        <div className="flex gap-2">
          {['1d', '7d', '30d', '90d'].map((period) => (
            <button
              key={period}
              onClick={() => setTimeframe(period)}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                timeframe === period
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Portfolio Value</h3>
          <p className="text-2xl font-bold">{fmtGulu(portfolioValue?.totalValue)}</p>
          <div className={`text-sm mt-1 ${
            Number(performance?.totalReturn) >= 0 ? 'text-emerald-500' : 'text-red-500'
          }`}>
            {performance ? fmtPercent(performance.totalReturn) : EMPTY}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Profit/Loss</h3>
          <p className={`text-2xl font-bold ${
            Number(performance?.totalPnL) >= 0 ? 'text-emerald-500' : 'text-red-500'
          }`}>
            {performance ? fmtGulu(performance.totalPnL) : EMPTY}
          </p>
          <div className="text-sm text-gray-500 mt-1">
            Cash: {fmtGulu(portfolioValue?.cashBalance)}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Win Rate</h3>
          <p className="text-2xl font-bold text-brand-500">
            {hasClosedTrades ? `${Number(performance.winRate).toFixed(1)}%` : EMPTY}
          </p>
          <div className="text-sm text-gray-500 mt-1">
            {hasClosedTrades
              ? `${performance.winningTrades}/${closedCount} closed trades`
              : 'No closed trades yet'}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Trades</h3>
          <p className="text-2xl font-bold">{hasTrades ? totalTrades : EMPTY}</p>
          <div className="text-sm text-gray-500 mt-1">
            Last {timeframe === '1d' ? '24 hours' : timeframe}
          </div>
        </div>
      </div>

      {/* Allocation */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-4">Portfolio Allocation</h3>
        {holdings.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">{EMPTY}</p>
        ) : (
          <div className="space-y-4">
            {holdings.map((holding) => (
              <div key={holding.asset}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{holding.asset}/GULU</span>
                  <span className="tabular-nums">
                    {fmtGulu(holding.value)} · {Number(holding.allocation || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${Math.min(Number(holding.allocation) || 0, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Holdings Breakdown */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-4">Holdings Analysis</h3>
        {holdings.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">{EMPTY}</p>
        ) : (
          <div className="space-y-4">
            {holdings.map((holding) => (
              <div key={holding.asset} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center text-white font-bold">
                    {holding.asset.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold">{holding.asset}</h4>
                    <p className="text-sm text-gray-500">
                      {fmtAmount(holding.quantity, 8)} {holding.asset}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtGulu(holding.value)}</p>
                  <p className="text-sm text-gray-500">
                    Price {fmtGulu(holding.marketPrice)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trading Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Trading Performance</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-500">Best Trade</span>
              <span className="font-semibold text-emerald-500">
                {bestTrade ? fmtGulu(bestTrade.pnl) : EMPTY}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Worst Trade</span>
              <span className="font-semibold text-red-500">
                {worstTrade ? fmtGulu(worstTrade.pnl) : EMPTY}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Losing Trades</span>
              <span className="font-semibold">
                {hasClosedTrades ? performance.losingTrades : EMPTY}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Trades</span>
              <span className="font-semibold">{hasTrades ? totalTrades : EMPTY}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Market Insights</h3>
          {marketEntries.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{EMPTY}</p>
          ) : (
            <div className="space-y-4">
              {marketEntries.map(([symbol, data]) => (
                <div key={symbol} className="flex justify-between items-center">
                  <span className="capitalize font-medium">{symbol}</span>
                  <div className="text-right">
                    <p className="font-semibold">{fmtGulu(data.price)}</p>
                    <p className={`text-sm ${
                      Number(data.change) >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                      {fmtPercent(data.change)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Risk Analysis */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-4">Risk Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
              <i className="fas fa-chart-pie text-2xl text-emerald-500"></i>
            </div>
            <h4 className="font-semibold mb-2">Portfolio Diversification</h4>
            <p className="text-sm text-gray-500">
              {holdings.length ? `${holdings.length} asset(s) held` : EMPTY}
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <i className="fas fa-balance-scale text-2xl text-blue-500"></i>
            </div>
            <h4 className="font-semibold mb-2">Concentration Risk</h4>
            <p className="text-sm text-gray-500">
              {risk?.concentrationRisk == null
                ? EMPTY
                : `${Number(risk.concentrationRisk).toFixed(1)}%`}
            </p>
          </div>

          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <i className="fas fa-bullseye text-2xl text-orange-500"></i>
            </div>
            <h4 className="font-semibold mb-2">Correlation Risk</h4>
            <p className="text-sm text-gray-500">{risk?.correlationRisk || EMPTY}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Analytics
