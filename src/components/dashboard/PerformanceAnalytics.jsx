import React, { useEffect, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import axios from '../../utils/axios'

const EMPTY = 'No data yet'

const fmtGulu = (value, digits = 2) => {
  if (value == null) return EMPTY
  const number = Number(value)
  return Number.isFinite(number)
    ? `${number.toLocaleString(undefined, { maximumFractionDigits: digits })} GULU`
    : EMPTY
}

const fmtPercent = (value, digits = 2) => {
  const number = Number(value)
  return Number.isFinite(number) ? `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%` : EMPTY
}

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

const PerformanceAnalytics = () => {
  const [activeTab, setActiveTab] = useState('performance')
  const [timeRange, setTimeRange] = useState('30d')
  const [performance, setPerformance] = useState(null)
  const [portfolioValue, setPortfolioValue] = useState(null)
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const days = RANGE_DAYS[timeRange] || 30

    setLoading(true)
    Promise.allSettled([
      axios.get('/api/portfolio/performance', { params: { timeRange: days } }),
      axios.get('/api/portfolio/value'),
      axios.get('/api/users/trades'),
    ]).then(([performanceRes, valueRes, tradesRes]) => {
      if (cancelled) return
      setPerformance(performanceRes.status === 'fulfilled' ? performanceRes.value.data : null)
      setPortfolioValue(valueRes.status === 'fulfilled' ? valueRes.value.data : null)
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
  }, [timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  const closedCount = (Number(performance?.winningTrades) || 0) + (Number(performance?.losingTrades) || 0)
  const hasClosedTrades = closedCount > 0
  const totalTrades = Number(performance?.totalTrades) || 0
  const hasTrades = totalTrades > 0
  const windowStart = Date.now() - (RANGE_DAYS[timeRange] || 30) * 86400000

  // Only closed sells inside the selected window can carry realized P&L; buys
  // would otherwise add zero rows to both the curve and the return histogram
  const pnlTrades = trades.filter(
    (trade) => trade.side === 'sell' && Number(trade.time) >= windowStart && Number.isFinite(Number(trade.pnl))
  )

  const sortedTrades = [...pnlTrades].sort((a, b) => Number(a.time) - Number(b.time))
  let runningPnl = 0
  const cumulativeSeries = sortedTrades.map((trade) => {
    runningPnl += Number(trade.pnl)
    return { time: Number(trade.time), value: runningPnl }
  })

  const performanceChart = {
    labels: cumulativeSeries.map((point) => new Date(point.time).toLocaleDateString()),
    datasets: [
      {
        label: 'Cumulative Realized P&L (GULU)',
        data: cumulativeSeries.map((point) => point.value),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
      },
    ],
  }

  const bins = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
  const returns = pnlTrades
    .map((trade) => {
      const notional = Number(trade.size) * Number(trade.price)
      return notional > 0 ? (Number(trade.pnl) / notional) * 100 : null
    })
    .filter((value) => value !== null)
  const returnsDistribution = {
    labels: bins.map((bin) => `${bin}%`),
    datasets: [
      {
        label: 'Trades',
        // The outer buckets absorb everything outside the ±5% range
        data: bins.map((bin, index) =>
          returns.filter((r) => {
            if (index === 0) return r < bin + 1
            if (index === bins.length - 1) return r >= bin
            return r >= bin && r < bin + 1
          }).length
        ),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 1,
      },
    ],
  }

  const tradeMetrics = [
    { metric: 'Total Trades', value: hasTrades ? totalTrades : EMPTY },
    { metric: 'Winning Trades', value: hasTrades ? performance.winningTrades : EMPTY },
    { metric: 'Losing Trades', value: hasTrades ? performance.losingTrades : EMPTY },
    { metric: 'Win Rate', value: hasClosedTrades ? `${Number(performance.winRate).toFixed(1)}%` : EMPTY },
    { metric: 'Total P&L', value: performance ? fmtGulu(performance.totalPnL) : EMPTY },
    { metric: 'Portfolio Value', value: fmtGulu(portfolioValue?.totalValue) },
  ]

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: false,
      },
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Performance Analytics</h2>
            <p className="text-gray-600 dark:text-gray-300">Deep dive into your trading performance</p>
          </div>

          <div className="flex gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Performance Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Total Return</p>
            <p className={`text-2xl font-bold ${
              Number(performance?.totalReturn) >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {performance ? fmtPercent(performance.totalReturn) : EMPTY}
            </p>
            <p className="text-xs text-gray-400">{timeRange}</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Sharpe Ratio</p>
            <p className="text-2xl font-bold">
              {performance && Number(performance.sharpeRatio) !== 0
                ? Number(performance.sharpeRatio).toFixed(2)
                : EMPTY}
            </p>
            <p className="text-xs text-gray-400">Risk-adjusted</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Max Drawdown</p>
            <p className="text-2xl font-bold text-red-500">
              {performance && Number(performance.maxDrawdown) !== 0
                ? fmtPercent(performance.maxDrawdown)
                : EMPTY}
            </p>
            <p className="text-xs text-gray-400">Peak to trough</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Win Rate</p>
            <p className="text-2xl font-bold">
              {hasClosedTrades ? `${Number(performance.winRate).toFixed(1)}%` : EMPTY}
            </p>
            <p className="text-xs text-gray-400">Closed sells</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="text-center">
            <p className="text-gray-500 text-sm">Profit Factor</p>
            <p className="text-2xl font-bold">
              {performance && Number(performance.profitFactor) !== 0
                ? Number(performance.profitFactor).toFixed(2)
                : EMPTY}
            </p>
            <p className="text-xs text-gray-400">Gross win / loss</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="glass rounded-2xl p-4">
        <div className="flex gap-4">
          {[
            { id: 'performance', name: 'Performance Chart' },
            { id: 'returns', name: 'Returns Analysis' },
            { id: 'trades', name: 'Trade Metrics' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === tab.id
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'performance' && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Cumulative Realized P&amp;L</h3>
          {cumulativeSeries.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-gray-500">{EMPTY}</div>
          ) : (
            <div className="h-96">
              <Line data={performanceChart} options={chartOptions} />
            </div>
          )}
          <div className="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-white/5">
            <h4 className="font-semibold mb-2">Current Portfolio</h4>
            <p className="text-2xl font-bold">{fmtGulu(portfolioValue?.totalValue)}</p>
            <p className="text-sm text-gray-500">
              Cash balance {fmtGulu(portfolioValue?.cashBalance)}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Returns Distribution</h3>
            {returns.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500">{EMPTY}</div>
            ) : (
              <div className="h-64">
                <Bar data={returnsDistribution} options={chartOptions} />
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Trade Breakdown</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <span>Realized P&amp;L</span>
                <span className={`font-semibold ${
                  Number(performance?.realizedPnL) >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {performance ? fmtGulu(performance.realizedPnL) : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <span>Winning Trades</span>
                <span className="font-semibold">
                  {hasTrades ? performance.winningTrades : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <span>Losing Trades</span>
                <span className="font-semibold">
                  {hasTrades ? performance.losingTrades : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <span>Average Win</span>
                <span className="font-semibold">
                  {performance && Number(performance.avgWin) !== 0 ? fmtGulu(performance.avgWin) : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                <span>Average Loss</span>
                <span className="font-semibold">
                  {performance && Number(performance.avgLoss) !== 0 ? fmtGulu(performance.avgLoss) : EMPTY}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trades' && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Trading Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {tradeMetrics.map((metric) => (
              <div key={metric.metric} className="p-4 rounded-lg bg-gray-50 dark:bg-white/5">
                <p className="text-sm text-gray-500 mb-1">{metric.metric}</p>
                <p className="text-lg font-bold">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default PerformanceAnalytics
