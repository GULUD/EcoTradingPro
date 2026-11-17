import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../contexts/WebSocketContext'
import axios from '../../utils/axios'

const FEE_RATE = 0.001

function Trading() {
  const { user, updateUser } = useAuth()
  const { marketData: liveMarketData } = useWebSocket()
  const [orderType, setOrderType] = useState('limit')
  const [tradeType, setTradeType] = useState('buy')
  const [selectedAsset, setSelectedAsset] = useState('BTC')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [triggerPrice, setTriggerPrice] = useState('')
  const [priceSnapshot, setPriceSnapshot] = useState({})
  const [account, setAccount] = useState({ balance: 0, portfolio: {} })
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] })
  const [recentTrades, setRecentTrades] = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const assets = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'BNB', 'MATIC', 'DOT', 'LINK', 'UNI']

  const prices = { ...priceSnapshot, ...liveMarketData }
  const pair = `${selectedAsset}/GULU`
  const lastPrice = Number(prices[pair]?.price) || 0
  const isStop = orderType === 'stop-loss' || orderType === 'stop-limit'
  const balance = Number(account.balance) || 0
  const held = Number(account.portfolio?.[selectedAsset] || 0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // Requests carry the id of the pair they were issued for; anything older is dropped
    const requestId = ++requestIdRef.current
    const asset = selectedAsset
    setOrderBook({ bids: [], asks: [] })
    setRecentTrades([])

    // /api/auth/me has no portfolio, so holdings must come from the profile endpoint
    loadProfile()
    fetchMarketPrices()
    const poll = () => {
      fetchOrderBook(asset, requestId)
      fetchRecentTrades(asset, requestId)
      fetchOpenOrders()
    }
    poll()
    // Prices stream over the socket; the book and tape only need a slow poll
    const timer = setInterval(poll, 8000)
    return () => clearInterval(timer)
  }, [selectedAsset])

  useEffect(() => {
    if (orderType === 'market' && lastPrice > 0) setPrice(String(lastPrice))
  }, [orderType, lastPrice])

  // Socket-driven profile refreshes land on the auth user; keep the local account in sync
  useEffect(() => {
    if (!user) return
    setAccount((prev) => ({
      balance: user.balance ?? prev.balance,
      portfolio: user.portfolio || prev.portfolio,
    }))
  }, [user?.balance, user?.portfolio])

  const loadProfile = async () => {
    try {
      const response = await axios.get('/api/users/profile')
      if (!mountedRef.current) return
      setAccount({
        balance: Number(response.data?.balance) || 0,
        portfolio: response.data?.portfolio || {},
      })
    } catch (error) {
      console.error('[trading] profile fetch failed', error.message)
    }
  }

  const refresh = async () => {
    await Promise.all([
      loadProfile(),
      fetchOrderBook(selectedAsset, requestIdRef.current),
      fetchRecentTrades(selectedAsset, requestIdRef.current),
      fetchOpenOrders(),
    ])
  }

  const fetchMarketPrices = async () => {
    try {
      const response = await axios.get('/api/market/prices')
      if (!mountedRef.current) return
      setPriceSnapshot(response.data || {})
    } catch (error) {
      console.error('[trading] price fetch failed', error.message)
    }
  }

  const fetchOrderBook = async (asset, requestId) => {
    try {
      const response = await axios.get(`/api/market/orderbook/${asset}`, { params: { depth: 14 } })
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setOrderBook({
        bids: response.data?.bids || [],
        asks: response.data?.asks || [],
      })
    } catch (error) {
      console.error('[trading] order book fetch failed', error.message)
    }
  }

  const fetchRecentTrades = async (asset, requestId) => {
    try {
      const response = await axios.get(`/api/market/trades/${asset}`, { params: { limit: 30 } })
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setRecentTrades(response.data || [])
    } catch (error) {
      console.error('[trading] recent trades fetch failed', error.message)
    }
  }

  const fetchOpenOrders = async () => {
    try {
      const response = await axios.get('/api/users/orders')
      if (!mountedRef.current) return
      setOpenOrders(response.data || [])
    } catch (error) {
      console.error('[trading] open orders fetch failed', error.message)
    }
  }

  // Buys are sized in quote (GULU), sells in base asset, matching the exchange convention
  const referencePrice = () => {
    if (orderType === 'limit' && price) return parseFloat(price) || 0
    if (orderType === 'stop-limit' && price) return parseFloat(price) || 0
    if (orderType === 'stop-loss' && triggerPrice) return parseFloat(triggerPrice) || 0
    const bestAsk = orderBook.asks[0]?.price
    const bestBid = orderBook.bids[0]?.price
    return tradeType === 'buy' ? bestAsk || lastPrice : bestBid || lastPrice
  }

  const quantity = () => {
    const value = parseFloat(amount)
    if (!value || value <= 0) return 0
    // Stop orders are always entered in base units so the fired trade matches the plan
    if (isStop) return value
    if (tradeType === 'sell') return value
    const px = referencePrice()
    return px > 0 ? value / px : 0
  }

  const total = () => {
    const value = parseFloat(amount)
    if (!value || value <= 0) return 0
    if (isStop) return value * referencePrice()
    if (tradeType === 'buy') return value
    return value * referencePrice()
  }

  const setPriceFromBook = (levelPrice, bookSide) => {
    setPrice(levelPrice.toFixed(2))
    setTradeType(bookSide === 'ask' ? 'buy' : 'sell')
    setOrderType('limit')
  }

  const submitOrder = async () => {
    const value = parseFloat(amount)
    if (!value || value <= 0) {
      setMessage(isStop ? `Enter the ${selectedAsset} quantity` : tradeType === 'buy' ? 'Enter the GULU amount to spend' : `Enter the ${selectedAsset} amount to sell`)
      return
    }
    if (orderType === 'limit' && !(parseFloat(price) > 0)) {
      setMessage('Enter a limit price')
      return
    }
    if (orderType === 'stop-limit' && !(parseFloat(price) > 0)) {
      setMessage('Enter a limit price for the stop-limit order')
      return
    }
    if (isStop && !(parseFloat(triggerPrice) > 0)) {
      setMessage('Enter a trigger price')
      return
    }
    if (isStop) {
      if (tradeType === 'buy' && value * referencePrice() > balance) {
        setMessage('Insufficient balance')
        return
      }
      if (tradeType === 'sell' && value > held) {
        setMessage(`Insufficient ${selectedAsset} balance`)
        return
      }
    } else if (tradeType === 'buy' && value > balance) {
      setMessage('Insufficient balance')
      return
    } else if (tradeType === 'sell' && value > held) {
      setMessage(`Insufficient ${selectedAsset} balance`)
      return
    }

    const payload = {
      symbol: selectedAsset,
      side: tradeType,
      type: orderType,
    }
    if (isStop) {
      payload.size = value
      payload.triggerPrice = parseFloat(triggerPrice)
    } else {
      payload.amount = value
    }
    if (orderType === 'limit' || orderType === 'stop-limit') payload.price = parseFloat(price)

    setLoading(true)
    setMessage('')
    try {
      const response = await axios.post('/api/users/orders', payload)
      const data = response.data
      if (!data.success) {
        setMessage(data.error || 'Order rejected')
        return
      }

      updateUser({
        ...user,
        balance: data.balance,
        portfolio: data.portfolio,
      })
      setAccount((prev) => ({
        balance: data.balance ?? prev.balance,
        portfolio: data.portfolio ?? prev.portfolio,
      }))

      const fills = data.fills || []
      const filled = fills.reduce((s, f) => s + f.size, 0)
      const notional = fills.reduce((s, f) => s + f.size * f.price, 0)
      const avg = filled > 0 ? notional / filled : 0

      if (data.order.status === 'open' || data.order.status === 'partial') {
        setMessage(
          isStop
            ? `Stop order armed: fires when ${selectedAsset}/GULU reaches ${data.order.triggerPrice} GULU`
            : `Resting order: ${data.order.remaining} ${selectedAsset} @ ${data.order.price} GULU`
        )
      } else if (filled > 0) {
        setMessage(`Filled ${filled.toFixed(6)} ${selectedAsset} at ${avg.toFixed(2)} GULU`)
      } else {
        setMessage('Order canceled, no fill')
      }

      setAmount('')
      await refresh()
    } catch (error) {
      setMessage(error.response?.data?.error || 'Order failed')
    } finally {
      setLoading(false)
    }
  }

  const cancelOrder = async (orderId) => {
    try {
      const response = await axios.delete(`/api/users/orders/${orderId}`)
      if (response.data?.success) {
        updateUser({ ...user, balance: response.data.balance, portfolio: response.data.portfolio })
        setAccount((prev) => ({
          balance: response.data.balance ?? prev.balance,
          portfolio: response.data.portfolio ?? prev.portfolio,
        }))
        setMessage('Order canceled')
      }
      await refresh()
    } catch (error) {
      setMessage(error.response?.data?.error || 'Cancel failed')
    }
  }

  const changePercent = Number(prices[pair]?.change ?? prices[pair]?.change24h) || 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Order Form */}
        <div className="xl:col-span-1 glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Place Order</h3>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setTradeType('buy')}
              className={`p-3 rounded-lg font-semibold transition ${
                tradeType === 'buy'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setTradeType('sell')}
              className={`p-3 rounded-lg font-semibold transition ${
                tradeType === 'sell'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Sell
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Market</label>
              <select
                value={selectedAsset}
                onChange={(e) => {
                  setSelectedAsset(e.target.value)
                  setAmount('')
                  setPrice('')
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {assets.map((asset) => (
                  <option key={asset} value={asset}>{asset}/GULU</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => {
                  const next = e.target.value
                  setOrderType(next)
                  setTriggerPrice(next.startsWith('stop') ? (lastPrice ? String(lastPrice) : '') : '')
                  if (next === 'market') setPrice(lastPrice ? String(lastPrice) : '')
                  else setPrice('')
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="limit">Limit Order</option>
                <option value="market">Market Order</option>
                <option value="stop-loss">Stop-Loss (Market)</option>
                <option value="stop-limit">Stop-Limit</option>
              </select>
            </div>

            {isStop && (
              <div>
                <label className="block text-sm font-medium mb-2">Trigger Price (GULU)</label>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={lastPrice ? lastPrice.toFixed(2) : '0.00'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {tradeType === 'buy' ? 'Fires when the price rises to or above this level.' : 'Fires when the price falls to or below this level.'}
                </p>
              </div>
            )}

            {orderType !== 'stop-loss' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {orderType === 'stop-limit' ? 'Limit Price (GULU)' : 'Price (GULU)'}
                </label>
                <input
                  type="number"
                  value={price}
                  readOnly={orderType === 'market'}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                    orderType === 'market' ? 'opacity-60' : ''
                  }`}
                  placeholder="0.00"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">
                {isStop || tradeType === 'sell' ? `Amount (${selectedAsset})` : 'Amount (GULU)'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.00"
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-sm space-y-2 tabular-nums">
              <div className="flex justify-between">
                <span>Quantity</span>
                <span>{quantity().toFixed(6)} {selectedAsset}</span>
              </div>
              <div className="flex justify-between">
                <span>Total</span>
                <span className="tabular-nums">{total().toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU</span>
              </div>
              <div className="flex justify-between">
                <span>Fee ({FEE_RATE * 100}%)</span>
                <span>
                  {tradeType === 'buy'
                    ? `${(quantity() * FEE_RATE).toFixed(6)} ${selectedAsset}`
                    : `${(total() * FEE_RATE).toFixed(2)} GULU`}
                </span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Available</span>
                <span>
                  {tradeType === 'buy'
                    ? `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} GULU`
                    : `${held.toFixed(6)} ${selectedAsset}`}
                </span>
              </div>
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.startsWith('Filled') || message.startsWith('Resting') || message.startsWith('Stop order') || message === 'Order canceled'
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              }`}>
                {message}
              </div>
            )}

            <button
              onClick={submitOrder}
              disabled={loading}
              className={`w-full py-3 rounded-lg font-semibold transition ${
                tradeType === 'buy'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              } disabled:opacity-50`}
            >
              {loading ? 'Submitting...' : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${selectedAsset}`}
            </button>
          </div>
        </div>

        {/* Market, order book */}
        <div className="xl:col-span-2 space-y-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">{pair}</h3>
            <div className="grid grid-cols-3 gap-4 tabular-nums">
              <div>
                <p className="text-sm text-gray-500">Last Price</p>
                <p className="text-2xl font-bold">
                  {lastPrice ? `${lastPrice.toLocaleString()} GULU` : '0 GULU'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">24h Change</p>
                <p className={`text-2xl font-bold ${changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {changePercent >= 0 ? '+' : ''}
                  {Number(changePercent || 0).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">24h Volume</p>
                <p className="text-2xl font-bold">
                  {Number(prices[pair]?.volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} {selectedAsset}
                </p>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Order Book</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-red-500 mb-2">Asks</h4>
                <div className="space-y-1 tabular-nums">
                  {orderBook.asks.slice(0, 8).reverse().map((ask) => (
                    <div
                      key={ask.price}
                      onClick={() => setPriceFromBook(ask.price, 'ask')}
                      className="flex justify-between text-xs cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 p-1 rounded"
                    >
                      <span className="text-red-500">{ask.price.toFixed(2)}</span>
                      <span>{ask.size.toFixed(4)}</span>
                    </div>
                  ))}
                  {orderBook.asks.length === 0 && (
                    <p className="text-xs text-gray-500 py-2">No asks</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-gray-500">Spread</p>
                  <p className="font-semibold tabular-nums">
                    {((orderBook.asks[0]?.price || 0) - (orderBook.bids[0]?.price || 0)).toFixed(2)} GULU
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-emerald-500 mb-2">Bids</h4>
                <div className="space-y-1 tabular-nums">
                  {orderBook.bids.slice(0, 8).map((bid) => (
                    <div
                      key={bid.price}
                      onClick={() => setPriceFromBook(bid.price, 'bid')}
                      className="flex justify-between text-xs cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10 p-1 rounded"
                    >
                      <span className="text-emerald-500">{bid.price.toFixed(2)}</span>
                      <span>{bid.size.toFixed(4)}</span>
                    </div>
                  ))}
                  {orderBook.bids.length === 0 && (
                    <p className="text-xs text-gray-500 py-2">No bids</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent trades, open orders */}
        <div className="xl:col-span-1 space-y-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Recent Trades</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto tabular-nums">
              {recentTrades.map((trade) => (
                <div key={trade.id} className="flex justify-between items-center text-sm">
                  <span className={trade.side === 'buy' ? 'text-emerald-500' : 'text-red-500'}>
                    {trade.price.toFixed(2)} GULU
                  </span>
                  <span>{trade.size.toFixed(4)}</span>
                  <span className="text-gray-500">
                    {new Date(trade.time).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {recentTrades.length === 0 && (
                <p className="text-gray-500 text-center py-4 text-sm">No trades yet</p>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">Open Orders</h3>
            {openOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No open orders</p>
            ) : (
              <div className="space-y-3">
                {openOrders.map((order) => (
                  <div key={order.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          order.side === 'buy'
                            ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        }`}>
                          {order.side.toUpperCase()}
                        </span>
                        <span className="ml-2 font-semibold">{order.symbol}</span>
                      </div>
                      <button
                        onClick={() => cancelOrder(order.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                      <div>{order.remaining} @ {order.price} GULU</div>
                      <div>
                        {order.type.replace('_', '-')} order
                        {order.triggerPrice ? `, trigger ${order.triggerPrice} GULU` : ''}
                        {order.filled > 0 ? `, filled ${order.filled}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Trading
