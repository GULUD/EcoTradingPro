import React, { useEffect, useState } from 'react'
import axios from '../../utils/axios'

const EMPTY = 'No data yet'

const fmtGulu = (value, digits = 2) => {
  const number = Number(value)
  return Number.isFinite(number)
    ? `${number.toLocaleString(undefined, { maximumFractionDigits: digits })} GULU`
    : EMPTY
}

const getRiskColor = (risk) => {
  switch (risk) {
    case 'low': return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
    case 'medium': return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
    case 'high': return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
    default: return 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400'
  }
}

const classifyExposure = (allocation) => {
  const value = Number(allocation) || 0
  if (value >= 40) return 'high'
  if (value >= 20) return 'medium'
  return 'low'
}

const RiskManagement = () => {
  const [risk, setRisk] = useState(null)
  const [composition, setComposition] = useState(null)
  const [portfolioValue, setPortfolioValue] = useState(null)
  const [loading, setLoading] = useState(true)

  const [calculator, setCalculator] = useState({
    balance: '10000',
    riskPercent: '2',
    entryPrice: '45000',
    stopLoss: '42000',
  })

  const [riskSettings, setRiskSettings] = useState({
    maxRiskPerTrade: 2,
    maxPortfolioRisk: 10,
    stopLossPercentage: 5,
    takeProfitRatio: 2,
    maxPositions: 10,
  })

  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      axios.get('/api/portfolio/risk'),
      axios.get('/api/portfolio/composition'),
      axios.get('/api/portfolio/value'),
    ]).then(([riskRes, compositionRes, valueRes]) => {
      if (cancelled) return
      setRisk(riskRes.status === 'fulfilled' ? riskRes.value.data : null)
      setComposition(compositionRes.status === 'fulfilled' ? compositionRes.value.data : null)
      setPortfolioValue(valueRes.status === 'fulfilled' ? valueRes.value.data : null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    )
  }

  const holdings = composition?.byAsset || []

  const balance = Number(calculator.balance) || 0
  const riskPercent = Number(calculator.riskPercent) || 0
  const entryPrice = Number(calculator.entryPrice) || 0
  const stopLoss = Number(calculator.stopLoss) || 0
  const riskAmount = (balance * riskPercent) / 100
  const riskPerUnit = Math.abs(entryPrice - stopLoss)
  const positionSize = riskPerUnit > 0 ? riskAmount / riskPerUnit : 0
  const positionValue = positionSize * entryPrice

  const alerts = []
  if (risk && Number(risk.concentrationRisk) > 50) {
    alerts.push({
      id: 'concentration',
      severity: 'high',
      message: `Top position is ${Number(risk.concentrationRisk).toFixed(1)}% of the portfolio`,
    })
  }
  if (risk && Number(risk.leverageRatio) > 1.5) {
    alerts.push({
      id: 'leverage',
      severity: 'medium',
      message: `Leverage ratio is ${Number(risk.leverageRatio).toFixed(2)}x`,
    })
  }
  if (holdings.length === 0) {
    alerts.push({
      id: 'empty',
      severity: 'low',
      message: 'No holdings in the portfolio yet',
    })
  }

  const updateCalculator = (field, value) => {
    setCalculator((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Risk Management</h2>
            <p className="text-gray-600 dark:text-gray-300">Monitor and control portfolio risk exposure</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="px-4 py-2 bg-green-500 text-white rounded-lg opacity-50 cursor-not-allowed"
            >
              Generate Report
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg opacity-50 cursor-not-allowed"
            >
              Export Data
            </button>
          </div>
        </div>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Portfolio Concentration</p>
              <p className="text-2xl font-bold">
                {risk ? `${Number(risk.concentrationRisk).toFixed(1)}%` : EMPTY}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
              ⚠️
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-yellow-500 h-2 rounded-full"
              style={{ width: `${Math.min(Number(risk?.concentrationRisk) || 0, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">VaR (95%)</p>
              <p className="text-2xl font-bold">{risk ? fmtGulu(risk.var95) : EMPTY}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              📉
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">Daily Value at Risk</div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Leverage Ratio</p>
              <p className="text-2xl font-bold">
                {risk ? `${Number(risk.leverageRatio).toFixed(2)}x` : EMPTY}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              📊
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">Gross exposure</div>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Beta to Market</p>
              <p className="text-2xl font-bold">
                {risk ? Number(risk.betaToMarket).toFixed(2) : EMPTY}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
              🛡️
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-500">Relative volatility</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="glass rounded-2xl p-4">
        <div className="flex gap-4">
          {[
            { id: 'overview', name: 'Risk Overview' },
            { id: 'positions', name: 'Position Analysis' },
            { id: 'settings', name: 'Risk Settings' },
            { id: 'alerts', name: 'Risk Alerts' },
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
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Portfolio Heatmap</h3>
            {holdings.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">{EMPTY}</p>
            ) : (
              <div className="space-y-3">
                {holdings.map((holding) => {
                  const exposure = Number(holding.allocation) || 0
                  return (
                    <div key={holding.asset} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white font-bold">
                          {holding.asset[0]}
                        </div>
                        <div>
                          <div className="font-semibold">{holding.asset}</div>
                          <div className="text-sm text-gray-500">{exposure.toFixed(1)}% allocation</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-2 py-1 rounded text-xs font-semibold ${getRiskColor(classifyExposure(exposure))}`}>
                          {classifyExposure(exposure)} exposure
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Risk Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>Beta (vs Market)</span>
                <span className="font-semibold">
                  {risk ? Number(risk.betaToMarket).toFixed(2) : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Tracking Error</span>
                <span className="font-semibold">
                  {risk ? fmtGulu(risk.trackingError) : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Correlation Risk</span>
                <span className="font-semibold">{risk?.correlationRisk || EMPTY}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Largest Position</span>
                <span className="font-semibold">
                  {risk ? `${Number(risk.concentrationRisk).toFixed(1)}%` : EMPTY}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Portfolio Value</span>
                <span className="font-semibold">{fmtGulu(portfolioValue?.totalValue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Position Size Calculator</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Account Balance (GULU)</label>
                <input
                  type="number"
                  value={calculator.balance}
                  onChange={(e) => updateCalculator('balance', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Risk Per Trade (%)</label>
                <input
                  type="number"
                  value={calculator.riskPercent}
                  max="10"
                  onChange={(e) => updateCalculator('riskPercent', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Entry Price (GULU)</label>
                <input
                  type="number"
                  value={calculator.entryPrice}
                  onChange={(e) => updateCalculator('entryPrice', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Stop Loss (GULU)</label>
                <input
                  type="number"
                  value={calculator.stopLoss}
                  onChange={(e) => updateCalculator('stopLoss', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-900/20">
                <h4 className="font-semibold mb-2">Recommended Position Size</h4>
                <p className="text-2xl font-bold text-brand-500">
                  {positionSize.toFixed(6)}
                </p>
                <p className="text-sm text-gray-500">≈ {fmtGulu(positionValue)}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
                <h4 className="font-semibold mb-2">Maximum Loss</h4>
                <p className="text-2xl font-bold text-red-500">{fmtGulu(riskAmount)}</p>
                <p className="text-sm text-gray-500">{riskPercent}% of account</p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <h4 className="font-semibold mb-2">Stop Distance</h4>
                <p className="text-2xl font-bold text-green-500">
                  {riskPerUnit ? fmtGulu(riskPerUnit) : EMPTY}
                </p>
                <p className="text-sm text-gray-500">Per unit risk</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Risk Management Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Risk Per Trade (%)</label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={riskSettings.maxRiskPerTrade}
                  onChange={(e) => setRiskSettings({ ...riskSettings, maxRiskPerTrade: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>0.5%</span>
                  <span className="font-semibold">{riskSettings.maxRiskPerTrade}%</span>
                  <span>10%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Portfolio Risk (%)</label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={riskSettings.maxPortfolioRisk}
                  onChange={(e) => setRiskSettings({ ...riskSettings, maxPortfolioRisk: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>5%</span>
                  <span className="font-semibold">{riskSettings.maxPortfolioRisk}%</span>
                  <span>50%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Default Stop Loss (%)</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={riskSettings.stopLossPercentage}
                  onChange={(e) => setRiskSettings({ ...riskSettings, stopLossPercentage: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>1%</span>
                  <span className="font-semibold">{riskSettings.stopLossPercentage}%</span>
                  <span>20%</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Take Profit Ratio</label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={riskSettings.takeProfitRatio}
                  onChange={(e) => setRiskSettings({ ...riskSettings, takeProfitRatio: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>1:1</span>
                  <span className="font-semibold">1:{riskSettings.takeProfitRatio}</span>
                  <span>1:5</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Max Open Positions</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={riskSettings.maxPositions}
                  onChange={(e) => setRiskSettings({ ...riskSettings, maxPositions: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>1</span>
                  <span className="font-semibold">{riskSettings.maxPositions}</span>
                  <span>20</span>
                </div>
              </div>
              <div className="mt-6">
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="w-full py-3 bg-brand-500 text-white rounded-lg font-semibold opacity-50 cursor-not-allowed"
                >
                  Save Risk Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Risk Alerts</h3>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{EMPTY}</p>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div key={alert.id} className={`p-4 rounded-lg border-l-4 ${
                  alert.severity === 'high' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' :
                  alert.severity === 'medium' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' :
                  'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                }`}>
                  <p className="font-semibold">{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RiskManagement
