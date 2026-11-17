
import React, { useState, useEffect } from 'react'
import axios from '../../utils/axios'

function Watchlist() {
  const [watchlist, setWatchlist] = useState([])
  const [priceAlerts, setPriceAlerts] = useState([])
  const [marketPrices, setMarketPrices] = useState({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [showAlertForm, setShowAlertForm] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState('BTC')
  const [alertPrice, setAlertPrice] = useState('')
  const [alertType, setAlertType] = useState('above')
  const [alertError, setAlertError] = useState('')
  const [sortBy, setSortBy] = useState('symbol')
  const [sortOrder, setSortOrder] = useState('asc')
  const [availableAssets, setAvailableAssets] = useState([])

  useEffect(() => {
    fetchWatchlist()
    fetchPriceAlerts()
    fetchMarketPrices()

    const interval = setInterval(fetchMarketPrices, 3000)
    // Alert rows change server-side (triggered) even while the page is open
    const alertsInterval = setInterval(fetchPriceAlerts, 30000)
    return () => {
      clearInterval(interval)
      clearInterval(alertsInterval)
    }
  }, [])

  const fetchWatchlist = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get('/api/users/watchlist', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setWatchlist(response.data || [])
    } catch (error) {
      console.error('[watchlist] fetch failed', error.message)
    }
  }

  const fetchPriceAlerts = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get('/api/users/alerts', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setPriceAlerts(response.data || [])
    } catch (error) {
      console.error('[watchlist] alert fetch failed', error.message)
    }
  }

  const fetchMarketPrices = async () => {
    try {
      const [pricesResponse, listResponse] = await Promise.all([
        axios.get('/api/market/prices'),
        axios.get('/api/market/list'),
      ])
      setMarketPrices(pricesResponse.data)
      if (Array.isArray(listResponse.data?.data)) {
        const symbols = listResponse.data.data.map((coin) => coin.symbol)
        setAvailableAssets(symbols)
        // The alert form must default to a listed market, otherwise the first
        // option is shown while the state still points at a delisted symbol
        if (symbols.length) {
          setSelectedAsset((current) => (symbols.includes(current) ? current : symbols[0]))
        }
      }
    } catch (error) {
      console.error('[watchlist] market fetch failed', error.message)
    }
  }

  const addToWatchlist = async (asset) => {
    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/users/watchlist', { asset }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchWatchlist()
      setShowAddForm(false)
    } catch (error) {
      console.error('[watchlist] add failed', error.message)
    }
  }

  const removeFromWatchlist = async (asset) => {
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`/api/users/watchlist/${asset}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchWatchlist()
    } catch (error) {
      console.error('[watchlist] remove failed', error.message)
    }
  }

  const createPriceAlert = async () => {
    const price = parseFloat(alertPrice)
    if (!(price > 0)) {
      setAlertError('Enter a target price greater than zero')
      return
    }
    try {
      const token = localStorage.getItem('token')
      await axios.post('/api/users/alerts', {
        asset: selectedAsset,
        price,
        type: alertType
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchPriceAlerts()
      setShowAlertForm(false)
      setAlertPrice('')
      setAlertError('')
    } catch (error) {
      setAlertError(error.response?.data?.error || 'Failed to create price alert')
    }
  }

  const deleteAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`/api/users/alerts/${alertId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchPriceAlerts()
    } catch (error) {
      console.error('[watchlist] alert delete failed', error.message)
    }
  }

  const sortedWatchlist = [...watchlist].sort((a, b) => {
    let aVal, bVal
    
    switch (sortBy) {
      case 'symbol':
        aVal = a.asset
        bVal = b.asset
        break
      case 'price':
        aVal = marketPrices[`${a.asset}/GULU`]?.price || 0
        bVal = marketPrices[`${b.asset}/GULU`]?.price || 0
        break
      case 'change':
        aVal = marketPrices[`${a.asset}/GULU`]?.change || 0
        bVal = marketPrices[`${b.asset}/GULU`]?.change || 0
        break
      default:
        aVal = a.asset
        bVal = b.asset
    }
    
    if (aVal === bVal) return 0
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1
    } else {
      return aVal < bVal ? 1 : -1
    }
  })

  const availableToAdd = availableAssets.filter(asset => 
    !watchlist.find(w => w.asset === asset)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Watchlist & Alerts</h2>
            <p className="text-gray-600 dark:text-gray-300">Track your favorite assets and set price alerts</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
            >
              Add Asset
            </button>
            <button
              onClick={() => setShowAlertForm(true)}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
            >
              Set Alert
            </button>
          </div>
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Add Asset to Watchlist</h3>
            <div className="space-y-4">
              {availableToAdd.length === 0 ? (
                <p className="text-gray-500">All available assets are already in your watchlist</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableToAdd.map(asset => (
                    <button
                      key={asset}
                      onClick={() => addToWatchlist(asset)}
                      className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      {asset}/GULU
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Alert Modal */}
      {showAlertForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Set Price Alert</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Asset</label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  {availableAssets.map(asset => (
                    <option key={asset} value={asset}>{asset}/GULU</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Alert Type</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="above">Price Above</option>
                  <option value="below">Price Below</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Target Price (GULU)</label>
                <input
                  type="number"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Current: {marketPrices[`${selectedAsset}/GULU`]?.price?.toLocaleString() || '0'} GULU
                </p>
                {alertError && <p className="text-xs text-red-500 mt-1">{alertError}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAlertForm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={createPriceAlert}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
              >
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Watchlist */}
      <div className="glass rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">My Watchlist</h3>
          <div className="flex gap-2 text-sm">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            >
              <option value="symbol">Symbol</option>
              <option value="price">Price</option>
              <option value="change">Change</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {watchlist.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Your watchlist is empty. Add some assets to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2">Asset</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">24h Change</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedWatchlist.map(item => {
                  const priceData = marketPrices[`${item.asset}/GULU`]
                  return (
                    <tr key={item.asset} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3">
                        <div className="font-semibold">{item.asset}/GULU</div>
                      </td>
                      <td className="text-right py-3">
                        <div className="font-semibold">
                          {priceData?.price?.toLocaleString() || '0'} GULU
                        </div>
                      </td>
                      <td className="text-right py-3">
                        <div className={`font-semibold ${
                          Number(priceData?.change || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>
                          {Number(priceData?.change || 0) >= 0 ? '+' : ''}
                          {Number(priceData?.change || 0).toFixed(2)}%
                        </div>
                      </td>
                      <td className="text-right py-3">
                        <button
                          onClick={() => removeFromWatchlist(item.asset)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Price Alerts */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-xl font-semibold mb-4">Price Alerts</h3>
        
        {priceAlerts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No price alerts set. Create one to get notified when prices hit your targets!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {priceAlerts.map(alert => (
              <div key={alert.id} className="flex justify-between items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                  <div className="font-semibold">{alert.asset}/GULU</div>
                  <div className="text-sm text-gray-500">
                    Alert when price goes {alert.type} {alert.price?.toLocaleString()} GULU
                  </div>
                  <div className="text-xs text-gray-400">
                    Current: {marketPrices[`${alert.asset}/GULU`]?.price?.toLocaleString() || '0'} GULU
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    alert.status === 'active' 
                      ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                  }`}>
                    {alert.status}
                  </span>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Watchlist
