import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Link, useNavigate, Routes, Route } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useWebSocket } from '../../contexts/WebSocketContext'
import { API_BASE } from '../../utils/api'
import Chart from 'chart.js/auto'

// Panels are loaded on demand so the dashboard shell stays small
const Portfolio = lazy(() => import('./Portfolio'))
const Trading = lazy(() => import('./Trading'))
const Analytics = lazy(() => import('./Analytics'))
const Notifications = lazy(() => import('./Notifications'))
const OrderHistory = lazy(() => import('./OrderHistory'))
const Watchlist = lazy(() => import('./Watchlist'))
const AdvancedCharts = lazy(() => import('./AdvancedCharts'))
const RiskManagement = lazy(() => import('./RiskManagement'))
const PerformanceAnalytics = lazy(() => import('./PerformanceAnalytics'))
const P2P = lazy(() => import('./P2P'))

const panelFallback = <div className="p-8 text-sm text-gray-500">Loading...</div>

const CHART_TIMEFRAMES = { '1H': '1m', '1D': '15m', '1W': '1h', '1M': '4h', '1Y': '1d' }

const CRYPTO_ICONS = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
  XRP: 'X',
  BNB: 'B',
  ADA: '₳'
}

function UserDashboard() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { notifications } = useWebSocket()
  const navigate = useNavigate()
  const chartRef = useRef(null)

  const [activeTab, setActiveTab] = useState('buy')
  const [activeTimeFilter, setActiveTimeFilter] = useState('1W')
  const [tradeForm, setTradeForm] = useState({
    asset: 'BTC',
    amount: 500.00,
    orderType: 'market'
  })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const handleTradeFormChange = (field, value) => {
    setTradeForm(prev => ({ ...prev, [field]: value }))
  }

  const handleTimeFilterChange = (filter) => {
    setActiveTimeFilter(filter)
  }

  const unreadCount = notifications.length

  return (
    <div className="bg-white text-gray-900 dark:bg-[#0A0F1A] dark:text-gray-100 min-h-screen">
      <div className="flex min-h-screen">
        {/* Mobile drawer overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'w-72 lg:w-20' : 'w-72'} bg-white/90 dark:bg-[#0F172A]/85 backdrop-blur-lg border-r border-gray-200 dark:border-gray-800 transition-all duration-300 transform ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white font-bold">
                E
              </div>
              {!sidebarCollapsed && (
                <div className="text-xl font-extrabold">
                  <span className="text-brand-500">Eco</span>Trading<span className="text-emerald-500">Pro</span>
                </div>
              )}
            </div>
          </div>
          <nav className="px-4" onClick={() => setMobileSidebarOpen(false)}>
            <Link to="/dashboard" className="flex items-center gap-4 px-4 py-3 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 border-l-4 border-brand-500 mb-2">
              <i className="fas fa-home text-lg"></i>
              {!sidebarCollapsed && <span>Dashboard</span>}
            </Link>
            <Link to="/dashboard/portfolio" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-wallet text-lg"></i>
              {!sidebarCollapsed && <span>Portfolio</span>}
            </Link>
            <Link to="/dashboard/trading" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-exchange-alt text-lg"></i>
              {!sidebarCollapsed && <span>Trade</span>}
            </Link>
            <Link to="/dashboard/p2p" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-handshake text-lg"></i>
              {!sidebarCollapsed && <span>P2P / Deposit</span>}
            </Link>
            <Link to="/dashboard/analytics" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-chart-bar text-lg"></i>
              {!sidebarCollapsed && <span>Analytics</span>}
            </Link>
            <Link to="/dashboard/advanced-charts" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-chart-line text-lg"></i>
              {!sidebarCollapsed && <span>Advanced Charts</span>}
            </Link>
            <Link to="/dashboard/notifications" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-bell text-lg"></i>
              {!sidebarCollapsed && <span>Notifications</span>}
            </Link>
            {/* New Navigation Links */}
            <Link to="/dashboard/order-history" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-list-alt text-lg"></i>
              {!sidebarCollapsed && <span>Order History</span>}
            </Link>
            <Link to="/dashboard/watchlist" className="flex items-center gap-4 px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 mb-2">
              <i className="fas fa-eye text-lg"></i>
              {!sidebarCollapsed && <span>Watchlist</span>}
            </Link>
          </nav>
        </div>

        {/* Main Content */}
        <div className={`flex-1 min-w-0 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'} transition-all duration-300`}>
          {/* Top Bar */}
          <header className="bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800 p-4 lg:p-6">
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 lg:hidden"
                >
                  <i className="fas fa-bars"></i>
                </button>
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <i className="fas fa-bars"></i>
                </button>
              </div>

              <div className="flex items-center gap-2 lg:gap-4">
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
                </button>
                <Link
                  to="/dashboard/notifications"
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 relative"
                >
                  <i className="fas fa-bell"></i>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Link>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white font-bold">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  <div className="hidden md:block">
                    <div className="font-semibold">{user?.firstName} {user?.lastName}</div>
                    <div className="text-sm text-gray-500">Trader</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-red-500"
                  >
                    <i className="fas fa-sign-out-alt"></i>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Dashboard Content */}
          <main className="p-4 lg:p-6">
            <Suspense fallback={panelFallback}>
              <Routes>
              <Route
                path="/"
                element={
                  <DashboardHome
                    activeTimeFilter={activeTimeFilter}
                    onTimeFilterChange={handleTimeFilterChange}
                    chartRef={chartRef}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    tradeForm={tradeForm}
                    onTradeFormChange={handleTradeFormChange}
                  />
                }
              />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/trading" element={<Trading />} />
              <Route path="/p2p" element={<P2P />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/notifications" element={<Notifications />} />
              {/* New Routes */}
              <Route path="/order-history" element={<OrderHistory />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/advanced-charts" element={<AdvancedCharts />} />
            </Routes>
            </Suspense>
          </main>

          {/* Conditional Rendering for DashboardHome components */}
          {/* This section needs to be within the DashboardHome component or passed down */}
          {/* For now, let's assume DashboardHome is rendered and contains this logic */}
          {/* The actual implementation of DashboardHome is below */}
        </div>
      </div>
    </div>
  )
}

function DashboardHome({
  activeTimeFilter,
  onTimeFilterChange,
  chartRef,
  activeTab,
  setActiveTab,
  tradeForm,
  onTradeFormChange,
}) {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { notifications } = useWebSocket()
  const navigate = useNavigate()
  const [profile, setProfile] = useState({ balance: 0, portfolio: {} })
  const [marketData, setMarketData] = useState({})
  const [openOrders, setOpenOrders] = useState([])
  const [costBasis, setCostBasis] = useState({})
  const [activeView, setActiveView] = useState('analytics') // State for the tab selection within dashboard home content
  const chartInstance = useRef(null)

  useEffect(() => {
    let cancelled = false

    const loadMarket = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/market/prices`)
        if (!response.ok) return
        const payload = await response.json()
        if (cancelled || !payload || typeof payload !== 'object') return

        const next = {}
        Object.entries(payload).forEach(([pair, item]) => {
          const price = Number(item?.price)
          if (!Number.isFinite(price)) return
          const change = Number(item?.change24h ?? item?.change)
          next[pair] = { price, change: Number.isFinite(change) ? change : 0 }
        })
        // Only replace the table when the payload parsed into usable numbers
        if (Object.keys(next).length) setMarketData(next)
      } catch (error) {
        console.error('[dashboard] market fetch failed', error.message)
      }
    }

    loadMarket()
    const timer = setInterval(loadMarket, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // /api/auth/me omits portfolio, so balances and holdings come from the profile endpoint
    const loadAccount = async () => {
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [profileResponse, ordersResponse, tradesResponse] = await Promise.all([
          fetch(`${API_BASE}/api/users/profile`, { headers }),
          fetch(`${API_BASE}/api/users/orders`, { headers }),
          fetch(`${API_BASE}/api/users/trades`, { headers }),
        ])
        const profilePayload = profileResponse.ok ? await profileResponse.json() : null
        const ordersPayload = ordersResponse.ok ? await ordersResponse.json() : null
        const tradesPayload = tradesResponse.ok ? await tradesResponse.json() : null
        if (cancelled) return

        if (profilePayload) {
          setProfile({
            balance: Number(profilePayload.balance) || 0,
            portfolio: profilePayload.portfolio || {},
          })
        }
        if (Array.isArray(ordersPayload)) setOpenOrders(ordersPayload)

        // Weighted average buy price per asset, used when a live quote is missing
        if (Array.isArray(tradesPayload)) {
          const totals = {}
          for (const trade of tradesPayload) {
            if (trade.side !== 'buy') continue
            const asset = trade.asset || trade.symbol
            const size = Number(trade.size)
            const price = Number(trade.price)
            if (!asset || !Number.isFinite(size) || !Number.isFinite(price)) continue
            if (!totals[asset]) totals[asset] = { quantity: 0, cost: 0 }
            totals[asset].quantity += size
            totals[asset].cost += size * price
          }
          const basis = {}
          Object.entries(totals).forEach(([asset, total]) => {
            if (total.quantity > 0) basis[asset] = total.cost / total.quantity
          })
          setCostBasis(basis)
        }
      } catch (error) {
        console.error('[dashboard] account fetch failed', error.message)
      }
    }

    loadAccount()
    const timer = setInterval(loadAccount, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // The canvas only exists while this view renders, so creation and teardown follow the view
  useEffect(() => {
    if (activeView !== 'analytics') return
    const canvas = chartRef.current
    if (!canvas) return

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'BTC/GULU',
          data: [],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            grid: {
              color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              color: '#94a3b8',
              callback: function(value) {
                return value.toLocaleString()
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8'
            }
          }
        }
      }
    })
    chartInstance.current = chart

    let cancelled = false
    const loadChart = async () => {
      try {
        const timeframe = CHART_TIMEFRAMES[activeTimeFilter] || '1h'
        const response = await fetch(`${API_BASE}/api/market/chart/BTC?timeframe=${timeframe}`)
        if (!response.ok) return
        const payload = await response.json()
        if (cancelled || chartInstance.current !== chart) return
        const candles = Array.isArray(payload?.ohlcv) ? payload.ohlcv : []
        chart.data.labels = candles.map((c) => new Date(c.timestamp).toLocaleString())
        chart.data.datasets[0].data = candles.map((c) => Number(c.close))
        chart.update()
      } catch (error) {
        console.error('[dashboard] chart fetch failed', error.message)
      }
    }
    loadChart()

    return () => {
      cancelled = true
      if (chartInstance.current === chart) chartInstance.current = null
      chart.destroy()
    }
  }, [theme, activeTimeFilter, activeView, chartRef])

  let holdingsValue = 0
  let dailyChange = 0
  const unpricedAssets = []
  Object.entries(profile.portfolio || {}).forEach(([asset, rawQuantity]) => {
    const quantity = Number(rawQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return
    const quote = marketData[`${asset}/GULU`]
    const price = Number(quote?.price)

    // A missing quote must not silently drop the position; fall back to the average cost
    if (!Number.isFinite(price) || price <= 0) {
      unpricedAssets.push(asset)
      const cost = Number(costBasis[asset])
      if (Number.isFinite(cost) && cost > 0) holdingsValue += quantity * cost
      return
    }

    const value = quantity * price
    const change = Number(quote?.change) || 0
    holdingsValue += value
    dailyChange += (value * change) / 100
  })

  const totalValue = (Number(profile.balance) || 0) + holdingsValue
  const previousValue = totalValue - dailyChange
  const dailyChangePercent = previousValue > 0 ? (dailyChange / previousValue) * 100 : 0
  const unreadCount = notifications.length

  const tradePair = `${tradeForm.asset}/GULU`
  const tradePrice = Number(marketData[tradePair]?.price) || 0
  const tradeQuantity = tradePrice > 0 ? (Number(tradeForm.amount) || 0) / tradePrice : 0

  return (
    <>
      {/* Tabs for different dashboard sections */}
      <div className="flex gap-4 mb-8 overflow-x-auto">
        <button
          onClick={() => setActiveView('analytics')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'analytics'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveView('advanced-charts')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'advanced-charts'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Advanced Charts
        </button>
        <button
          onClick={() => setActiveView('order-history')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'order-history'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          History
        </button>
        <button
          onClick={() => setActiveView('watchlist')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'watchlist'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Watchlist
        </button>
        <button
          onClick={() => setActiveView('notifications')}
          className={`px-4 py-2 rounded-lg transition relative ${
            activeView === 'notifications'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Notifications
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('risk-management')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'risk-management'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Risk Management
        </button>
        <button
          onClick={() => setActiveView('performance')}
          className={`px-4 py-2 rounded-lg transition ${
            activeView === 'performance'
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Performance
        </button>
      </div>

      {/* Render content based on activeView */}
      {unpricedAssets.length > 0 && (
        <div className="mb-6 p-3 rounded-xl text-sm bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
          Some assets cannot be priced right now ({unpricedAssets.join(', ')}); they are valued at cost.
        </div>
      )}
      {activeView === 'analytics' && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-2xl p-6 hover:shadow-glow transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm text-gray-500 uppercase tracking-wide">Portfolio Value</h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <i className="fas fa-wallet text-brand-500"></i>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
              </div>
              <div className={`text-sm font-medium ${dailyChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                <i className={`fas ${dailyChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} mr-1`}></i>
                {dailyChange >= 0 ? '+' : '-'}{Math.abs(dailyChange).toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
                {' '}({dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}%)
              </div>
            </div>

            <div className="glass rounded-2xl p-6 hover:shadow-glow transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm text-gray-500 uppercase tracking-wide">Available Balance</h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <i className="fas fa-dollar-sign text-emerald-500"></i>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {(Number(profile.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
              </div>
              <div className="text-gray-500 text-sm">Account Balance</div>
            </div>

            <div className="glass rounded-2xl p-6 hover:shadow-glow transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm text-gray-500 uppercase tracking-wide">24h Profit/Loss</h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <i className="fas fa-chart-line text-brand-500"></i>
                </div>
              </div>
              <div className={`text-3xl font-bold mb-2 ${dailyChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {dailyChange >= 0 ? '+' : '-'}{Math.abs(dailyChange).toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
              </div>
              <div className={`text-sm font-medium ${dailyChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                <i className={`fas ${dailyChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} mr-1`}></i>
                {dailyChangePercent >= 0 ? '+' : ''}{dailyChangePercent.toFixed(2)}% Today
              </div>
            </div>

            <div className="glass rounded-2xl p-6 hover:shadow-glow transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm text-gray-500 uppercase tracking-wide">Active Orders</h3>
                </div>
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <i className="fas fa-exchange-alt text-brand-500"></i>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">{openOrders.length}</div>
              <div className="text-gray-500 text-sm">
                {openOrders.length === 0 ? 'No open orders' : 'Waiting to fill or cancel'}
              </div>
            </div>
          </div>

          {/* Trading Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Chart */}
            <div className="lg:col-span-2 glass rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">BTC/GULU Chart</h3>
                <div className="flex gap-2">
                  {['1H', '1D', '1W', '1M', '1Y'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => onTimeFilterChange(filter)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                        activeTimeFilter === filter
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64 lg:h-80">
                <canvas ref={chartRef}></canvas>
              </div>
            </div>

            {/* Trade Panel */}
            <div className="glass rounded-2xl p-6">
              <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
                {['buy', 'sell'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 px-1 font-medium text-sm transition ${
                      activeTab === tab
                        ? 'border-b-2 border-brand-500 text-brand-500'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Asset</label>
                  <select
                    value={tradeForm.asset}
                    onChange={(e) => onTradeFormChange('asset', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="BTC">Bitcoin (BTC)</option>
                    <option value="ETH">Ethereum (ETH)</option>
                    <option value="SOL">Solana (SOL)</option>
                    <option value="ADA">Cardano (ADA)</option>
                    <option value="XRP">Ripple (XRP)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Amount (GULU)</label>
                  <input
                    type="number"
                    value={tradeForm.amount}
                    onChange={(e) => onTradeFormChange('amount', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Price (GULU)</label>
                    <input
                      type="text"
                      value={tradePrice ? tradePrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-600"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Quantity</label>
                    <input
                      type="text"
                      value={tradeQuantity ? tradeQuantity.toFixed(6) : '-'}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-600"
                      readOnly
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Order Type</label>
                  <select
                    value={tradeForm.orderType}
                    onChange={(e) => onTradeFormChange('orderType', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="market">Market Order</option>
                    <option value="limit">Limit Order</option>
                    <option value="stop">Stop Order</option>
                  </select>
                </div>

                <button
                  onClick={() => navigate('/dashboard/trading')}
                  className={`w-full py-3 rounded-xl font-semibold transition ${
                    activeTab === 'buy'
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  <i className={`fas ${activeTab === 'buy' ? 'fa-arrow-up' : 'fa-arrow-down'} mr-2`}></i>
                  {activeTab === 'buy' ? 'Buy' : 'Sell'} {tradeForm.asset}
                </button>
              </div>
            </div>
          </div>

          {/* Market Overview & Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Movers */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-6">Top Movers</h3>
              <div className="space-y-4">
                {Object.keys(marketData).length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">Live market data unavailable.</p>
                )}
                {Object.entries(marketData).map(([pair, data]) => {
                  const [base] = pair.split('/')
                  const price = Number(data?.price) || 0
                  const change = Number(data?.change) || 0
                  return (
                    <div key={pair} className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white font-bold">
                          {CRYPTO_ICONS[base] || base[0]}
                        </div>
                        <div>
                          <div className="font-semibold">{base}</div>
                          <div className="text-sm text-gray-500">{pair}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {price.toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
                        </div>
                        <div className={`text-sm ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Open Orders */}
            <div className="glass rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Open Orders</h3>
                <Link to="/dashboard/order-history" className="text-brand-500 hover:text-brand-600 text-sm font-medium">
                  View All
                </Link>
              </div>
              <div className="space-y-4">
                {openOrders.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-6">No open orders yet.</p>
                )}
                {openOrders.slice(0, 4).map((order) => (
                  <div key={order.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      order.side === 'buy'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      <i className={`fas ${order.side === 'buy' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{(order.side || '').toUpperCase()} {order.symbol}</div>
                      <div className="text-sm text-gray-500">{order.type} order</div>
                    </div>
                    <div className="font-semibold text-right">
                      {Number(order.remaining) || 0} @ {Number(order.price) || 0} GULU
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <Suspense fallback={panelFallback}>
        {activeView === 'advanced-charts' && <AdvancedCharts />}
        {activeView === 'notifications' && <Notifications />}
        {activeView === 'order-history' && <OrderHistory />}
        {activeView === 'watchlist' && <Watchlist />}
        {activeView === 'risk-management' && <RiskManagement />}
        {activeView === 'performance' && <PerformanceAnalytics />}
      </Suspense>
    </>
  )
}

export default UserDashboard