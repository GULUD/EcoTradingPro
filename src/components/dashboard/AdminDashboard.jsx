import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useWebSocket } from '../../contexts/WebSocketContext'
import axios from '../../utils/axios'
import NewsManagement from './NewsManagement'
import { CoinManagement, BotFormation, PriceChart } from './AdminControls'
import {
  Home,
  Users,
  Wallet,
  BarChart3,
  Newspaper,
  UserRound,
  Sun,
  Moon,
  TrendingUp,
  Zap,
  ArrowLeftRight,
} from 'lucide-react'
import AdminP2P from './AdminP2P'

const formatUptime = (seconds) => {
  const total = Number(seconds)
  if (!Number.isFinite(total)) return 'No data yet'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}


function AdminDashboard() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { isConnected, reconnect } = useWebSocket()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [newBalance, setNewBalance] = useState('')
  const [balanceError, setBalanceError] = useState('')
  const [confirmingBalance, setConfirmingBalance] = useState(false)
  const [savingBalance, setSavingBalance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    Promise.allSettled([fetchUsers(), fetchStats()]).then(() => setLoading(false))
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/admin/users')
      setUsers(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error fetching users:', error.message)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/admin/stats')
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching stats:', error.message)
    }
  }

  const openBalanceEditor = (targetUser) => {
    setSelectedUser(targetUser)
    setNewBalance('')
    setBalanceError('')
    setConfirmingBalance(false)
  }

  const closeBalanceEditor = () => {
    setSelectedUser(null)
    setNewBalance('')
    setBalanceError('')
    setConfirmingBalance(false)
  }

  const requestBalanceUpdate = () => {
    if (!selectedUser) return
    const value = Number(newBalance)
    // Number('') is 0, so empty input needs its own guard before reaching the API
    if (String(newBalance).trim() === '' || !Number.isFinite(value) || value < 0) {
      setBalanceError('Enter a balance of zero or more')
      return
    }
    setBalanceError('')
    setConfirmingBalance(true)
  }

  const confirmBalanceUpdate = async () => {
    if (!selectedUser || savingBalance) return
    const value = Number(newBalance)
    setSavingBalance(true)
    setBalanceError('')
    try {
      const response = await axios.put(`/api/admin/users/${selectedUser.id}/balance`, { balance: value })
      setUsers((prev) => prev.map((item) => (item.id === selectedUser.id ? response.data : item)))
      closeBalanceEditor()
      fetchStats()
    } catch (error) {
      setBalanceError(error.response?.data?.error || 'Error updating balance')
    } finally {
      setSavingBalance(false)
    }
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to sign out of your admin session?')) {
      logout()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 text-white overflow-x-hidden min-h-screen">
      {/* Animated Background */}
      <div className="fixed inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(93, 92, 222, 0.1) 1px, transparent 0)',
        backgroundSize: '20px 20px'
      }}></div>
      <div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-600/5 pointer-events-none"></div>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-screen ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 border-r border-gray-700/50 transform transition-all duration-300 z-40`}
      >
        {/* Logo Section */}
        <div className="p-6 border-b border-gray-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center animate-pulse">
              <span className="text-white font-bold text-lg">₿</span>
            </div>
            {!sidebarCollapsed && (
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Eco Trading Pro</h2>
                <p className="text-xs text-gray-400">Admin Portal</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'dashboard'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Home className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Dashboard</span>}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'users'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Users className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">User Management</span>}
            </button>
            <button
              onClick={() => setActiveTab('balance')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'balance'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Wallet className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Balance Control</span>}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'analytics'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <BarChart3 className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Analytics</span>}
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'news'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Newspaper className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">News Manager</span>}
            </button>
            <button
              onClick={() => setActiveTab('coins')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'coins'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Wallet className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Coin Control</span>}
            </button>
            <button
              onClick={() => setActiveTab('bots')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'bots'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <Zap className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Bot Formation</span>}
            </button>
            <button
              onClick={() => setActiveTab('price')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'price'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <TrendingUp className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">Price Chart</span>}
            </button>
            <button
              onClick={() => setActiveTab('p2p')}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${
                activeTab === 'p2p'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-gray-800/50 text-gray-300 hover:text-white'
              }`}
            >
              <ArrowLeftRight className="w-5 h-5 mr-4" />
              {!sidebarCollapsed && <span className="font-medium">P2P / GULU</span>}
            </button>
          </div>
        </nav>

        {/* Admin Status */}
        {!sidebarCollapsed && (
          <div className="absolute bottom-6 left-3 right-3">
            <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <UserRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium">{user?.name || 'Admin User'}</p>
                  <p className="text-xs text-green-400 flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                    Online
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className={`${sidebarCollapsed ? 'ml-20' : 'ml-64'} transition-all duration-300`}>
        {/* Top Bar */}
        <header className="backdrop-filter backdrop-blur-lg bg-white/5 border-b border-gray-700/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={toggleSidebar} className="p-2 rounded-xl hover:bg-gray-700/50 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  Welcome back, Admin
                </h1>
                <p className="text-gray-400 text-sm">Monitor and manage your trading platform</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl hover:bg-gray-700/50 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Real-time indicator */}
              {isConnected ? (
                <div className="flex items-center space-x-2 px-3 py-2 bg-green-500/20 rounded-lg border border-green-500/30">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-green-400 text-sm font-medium">Live</span>
                </div>
              ) : (
                <button
                  onClick={reconnect}
                  className="flex items-center space-x-2 px-3 py-2 bg-red-500/20 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-colors"
                >
                  <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                  <span className="text-red-400 text-sm font-medium">Offline · Reconnect</span>
                </button>
              )}

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="px-6 py-2 bg-gradient-to-r from-primary to-purple-600 rounded-xl hover:shadow-lg hover:shadow-primary/25 transition-all duration-300 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-6">
          {activeTab === 'dashboard' && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Users */}
                <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{stats ? stats.totalUsers : users.length}</h3>
                  <p className="text-gray-400 text-sm">Total Users</p>
                </div>

                {/* Active Traders */}
                <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">
                    {stats ? stats.activeUsers : users.filter(u => u.isActive).length}
                  </h3>
                  <p className="text-gray-400 text-sm">Active Traders</p>
                </div>

                {/* Total User Balances */}
                <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">
                    {stats
                      ? `${Number(stats.totalBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU`
                      : 'No data yet'}
                  </h3>
                  <p className="text-gray-400 text-sm">Total User Balances</p>
                </div>

                {/* System Uptime */}
                <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                      <Zap className="w-6 h-6 text-orange-400" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">
                    {stats ? formatUptime(stats.systemUptime) : 'No data yet'}
                  </h3>
                  <p className="text-gray-400 text-sm">System Uptime</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                <button
                  onClick={() => setActiveTab('balance')}
                  className="w-full p-6 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 flex items-center justify-center"
                >
                  <Wallet className="w-5 h-5 mr-3" />
                  <span className="font-medium">Adjust Balance</span>
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className="w-full p-6 bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 flex items-center justify-center"
                >
                  <Users className="w-5 h-5 mr-3" />
                  <span className="font-medium">Manage Users</span>
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className="w-full p-6 bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all duration-300 flex items-center justify-center"
                >
                  <BarChart3 className="w-5 h-5 mr-3" />
                  <span className="font-medium">View Reports</span>
                </button>
              </div>
            </>
          )}

          {(activeTab === 'users' || activeTab === 'balance') && (
            <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">User Management</h2>
                <p className="text-gray-400">Manage user accounts and balances</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-700/50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Joined</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-white/5">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-100">{user.firstName} {user.lastName}</div>
                            <div className="text-sm text-gray-400">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-100">
                            {(Number(user.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.isActive
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => openBalanceEditor(user)}
                            className="text-primary hover:text-purple-400 transition-colors"
                          >
                            Edit Balance
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-2xl font-bold mb-6">Platform Analytics</h2>
              {!stats ? (
                <p className="text-gray-400 py-8 text-center">No data yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-lg">
                    <h3 className="text-sm font-medium text-blue-400 mb-2">Total Users</h3>
                    <p className="text-3xl font-bold text-blue-300">{stats.totalUsers}</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-lg">
                    <h3 className="text-sm font-medium text-green-400 mb-2">Active Users</h3>
                    <p className="text-3xl font-bold text-green-300">{stats.activeUsers}</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 p-6 rounded-lg">
                    <h3 className="text-sm font-medium text-purple-400 mb-2">Total User Balances</h3>
                    <p className="text-3xl font-bold text-purple-300">
                      {Number(stats.totalBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'news' && <NewsManagement />}
          {activeTab === 'coins' && <CoinManagement />}
          {activeTab === 'p2p' && <AdminP2P />}
          {activeTab === 'bots' && <BotFormation />}
          {activeTab === 'price' && <PriceChart />}
        </main>
      </div>

      {/* Balance Edit Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="backdrop-filter backdrop-blur-lg bg-white/10 border border-white/20 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">
              Edit Balance for {[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || selectedUser.email}
            </h3>

            {!confirmingBalance ? (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2 text-gray-300">New Balance (GULU)</label>
                  <input
                    type="number"
                    value={newBalance}
                    onChange={(e) => {
                      setNewBalance(e.target.value)
                      setBalanceError('')
                    }}
                    placeholder={(Number(selectedUser.balance) || 0).toString()}
                    className="w-full px-4 py-3 border border-gray-600 rounded-lg bg-gray-800/50 text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Current: {(Number(selectedUser.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU
                  </p>
                </div>
                {balanceError && <p className="text-sm text-red-400 mb-4">{balanceError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={requestBalanceUpdate}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-purple-600 text-white rounded-lg hover:shadow-lg transition-all font-medium"
                  >
                    Update
                  </button>
                  <button
                    onClick={closeBalanceEditor}
                    className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-3">Review the change before it is applied:</p>
                <div className="rounded-xl bg-gray-800/60 p-4 mb-4 space-y-2 tabular-nums">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Current</span>
                    <span>{(Number(selectedUser.balance) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">New</span>
                    <span className="font-semibold">{(Number(newBalance) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                    <span className="text-gray-400">Difference</span>
                    <span className={`font-semibold ${
                      (Number(newBalance) || 0) - (Number(selectedUser.balance) || 0) >= 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}>
                      {(Number(newBalance) || 0) - (Number(selectedUser.balance) || 0) >= 0 ? '+' : ''}
                      {((Number(newBalance) || 0) - (Number(selectedUser.balance) || 0)).toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU
                    </span>
                  </div>
                </div>
                {balanceError && <p className="text-sm text-red-400 mb-4">{balanceError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={confirmBalanceUpdate}
                    disabled={savingBalance}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-purple-600 text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50"
                  >
                    {savingBalance ? 'Updating…' : 'Confirm update'}
                  </button>
                  <button
                    onClick={() => setConfirmingBalance(false)}
                    disabled={savingBalance}
                    className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .primary { color: #5D5CDE; }
        .bg-primary { background-color: #5D5CDE; }
        .border-primary { border-color: #5D5CDE; }
        .text-primary { color: #5D5CDE; }
        .from-primary { --tw-gradient-from: #5D5CDE; }
        .to-primary { --tw-gradient-to: #5D5CDE; }
      `}</style>
    </div>
  )
}

export default AdminDashboard