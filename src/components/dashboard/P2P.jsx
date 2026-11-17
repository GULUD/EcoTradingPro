import React, { useEffect, useState } from 'react'
import axios from '../../utils/axios'

const CARD = 'bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-gray-800 rounded-2xl'
const FIELD =
  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const PRIMARY =
  'px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition disabled:opacity-50'
const GHOST =
  'px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-100 dark:hover:bg-white/5 transition disabled:opacity-50'
const DANGER =
  'px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition disabled:opacity-50'

const TABS = [
  { key: 'buy', label: 'Buy GULU' },
  { key: 'sell', label: 'Sell GULU' },
  { key: 'orders', label: 'My Orders' },
  { key: 'merchant', label: 'Merchant' },
]

const ORDER_STATUS = {
  pending_payment: { label: 'Pending payment', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  paid: { label: 'Paid', cls: 'bg-brand-500/10 text-brand-500' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  disputed: { label: 'Disputed', cls: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
}

const MERCHANT_STATUS = {
  pending: { label: 'Pending review', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  suspended: { label: 'Suspended', cls: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
}

const AD_STATUS = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  paused: { label: 'Paused', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const PAYMENT_TYPES = ['bank', 'alipay', 'wechat', 'usdt']

const fmt = (value, digits = 2) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits })

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : '-')

function StatusBadge({ map, value }) {
  const item =
    map[value] || { label: value, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${item.cls}`}>
      {item.label}
    </span>
  )
}

function P2P() {
  const [tab, setTab] = useState('buy')
  const [profile, setProfile] = useState({ balance: 0, locked: 0 })
  const [merchant, setMerchant] = useState(null)
  const [merchantAds, setMerchantAds] = useState([])
  const [ads, setAds] = useState({ sell: [], buy: [] })
  const [orders, setOrders] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [applyForm, setApplyForm] = useState({ businessName: '', contact: '', note: '' })
  const [adForm, setAdForm] = useState({
    side: 'sell',
    price: '',
    fiat: 'CNY',
    minAmount: '',
    maxAmount: '',
    available: '',
    terms: '',
    paymentMethods: [{ type: 'bank', account: '', name: '' }],
  })

  const [orderAd, setOrderAd] = useState(null)
  const [orderAmount, setOrderAmount] = useState('')
  const [orderError, setOrderError] = useState('')

  const [payOrder, setPayOrder] = useState(null)
  const [payMethodIndex, setPayMethodIndex] = useState('0')
  const [payRef, setPayRef] = useState('')
  const [payError, setPayError] = useState('')

  const loadProfile = async () => {
    try {
      const response = await axios.get('/api/users/profile')
      setProfile({ balance: response.data.balance || 0, locked: response.data.locked || 0 })
    } catch (err) {
      // A failed balance refresh must not clear the panel; orders still render
    }
  }

  const loadMerchant = async () => {
    try {
      const response = await axios.get('/api/p2p/merchant/me')
      setMerchant(response.data.merchant || null)
    } catch (err) {
      setMerchant(null)
    }
  }

  const loadMerchantAds = async () => {
    try {
      const response = await axios.get('/api/p2p/merchant/ads')
      setMerchantAds(response.data.ads || [])
    } catch (err) {
      setMerchantAds([])
    }
  }

  const loadAds = async () => {
    try {
      const [sellResponse, buyResponse] = await Promise.all([
        axios.get('/api/p2p/ads', { params: { side: 'sell' } }),
        axios.get('/api/p2p/ads', { params: { side: 'buy' } }),
      ])
      setAds({ sell: sellResponse.data.ads || [], buy: buyResponse.data.ads || [] })
    } catch (err) {
      // Keep the last known ads so the list does not flash empty on a transient error
    }
  }

  const loadOrders = async () => {
    try {
      const response = await axios.get('/api/p2p/orders')
      setOrders(response.data.orders || [])
    } catch (err) {
      // Same rationale as ads: a polling failure should not wipe the table
    }
  }

  useEffect(() => {
    loadProfile()
    loadMerchant()
    loadMerchantAds()
    loadAds()
    loadOrders()
    const timer = setInterval(() => {
      loadAds()
      loadOrders()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const refreshAll = async () => {
    await Promise.all([loadProfile(), loadAds(), loadOrders(), loadMerchantAds()])
  }

  const run = async (fn) => {
    setBusy(true)
    setNotice('')
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const submitApply = (event) => {
    event.preventDefault()
    run(async () => {
      const response = await axios.post('/api/p2p/merchant/apply', applyForm)
      setMerchant(response.data.merchant)
      setNotice('Application submitted for review')
      await loadMerchantAds()
    })
  }

  const updateMethod = (index, field, value) => {
    setAdForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map((method, i) =>
        i === index ? { ...method, [field]: value } : method
      ),
    }))
  }

  const addMethodRow = () => {
    setAdForm((prev) => ({
      ...prev,
      paymentMethods: [...prev.paymentMethods, { type: 'bank', account: '', name: '' }],
    }))
  }

  const removeMethodRow = (index) => {
    setAdForm((prev) => ({
      ...prev,
      paymentMethods:
        prev.paymentMethods.length === 1
          ? prev.paymentMethods
          : prev.paymentMethods.filter((_, i) => i !== index),
    }))
  }

  const submitAd = (event) => {
    event.preventDefault()
    const methods = adForm.paymentMethods.filter((method) => method.account.trim())
    if (!methods.length) {
      setError('Add at least one payment account')
      return
    }
    run(async () => {
      await axios.post('/api/p2p/merchant/ads', {
        side: adForm.side,
        price: Number(adForm.price),
        fiat: adForm.fiat || 'CNY',
        minAmount: Number(adForm.minAmount),
        maxAmount: Number(adForm.maxAmount),
        available: Number(adForm.available),
        paymentMethods: methods,
        terms: adForm.terms,
      })
      setAdForm((prev) => ({
        ...prev,
        price: '',
        minAmount: '',
        maxAmount: '',
        available: '',
        terms: '',
        paymentMethods: [{ type: 'bank', account: '', name: '' }],
      }))
      setNotice('Ad published')
      await refreshAll()
    })
  }

  const setMerchantAdStatus = (id, status) => {
    run(async () => {
      await axios.patch(`/api/p2p/merchant/ads/${id}`, { status })
      await refreshAll()
    })
  }

  const closeMerchantAd = (id) => {
    if (!window.confirm('Close this ad permanently?')) return
    run(async () => {
      await axios.delete(`/api/p2p/merchant/ads/${id}`)
      setNotice('Ad closed')
      await refreshAll()
    })
  }

  const openOrder = (ad) => {
    setOrderAd(ad)
    setOrderAmount('')
    setOrderError('')
  }

  const orderFiat = orderAd ? Number(orderAmount || 0) * Number(orderAd.price || 0) : 0

  const submitOrder = () => {
    if (!orderAd) return
    const amount = Number(orderAmount)
    if (!(amount > 0)) {
      setOrderError('Enter a GULU amount')
      return
    }
    if (amount > orderAd.available) {
      setOrderError('Amount exceeds ad liquidity')
      return
    }
    if (orderFiat < orderAd.minAmount || orderFiat > orderAd.maxAmount) {
      setOrderError(
        `Order must be between ${fmt(orderAd.minAmount)} and ${fmt(orderAd.maxAmount)} ${orderAd.fiat}`
      )
      return
    }
    run(async () => {
      const response = await axios.post('/api/p2p/orders', { adId: orderAd.id, amount })
      setOrderAd(null)
      setOrderAmount('')
      setTab('orders')
      setNotice(`Order created: ${fmt(response.data.order?.amount, 8)} GULU`)
      await refreshAll()
    })
  }

  const openPay = (order) => {
    setPayOrder(order)
    setPayMethodIndex('0')
    setPayRef('')
    setPayError('')
  }

  const submitPay = () => {
    if (!payOrder) return
    const method = payOrder.paymentMethods?.[Number(payMethodIndex)]
    if (!method) {
      setPayError('Select a payment method')
      return
    }
    if (!payRef.trim()) {
      setPayError('Enter the payment reference')
      return
    }
    run(async () => {
      await axios.post(`/api/p2p/orders/${payOrder.id}/pay`, {
        method: `${method.type}:${method.account}`,
        ref: payRef.trim(),
      })
      setPayOrder(null)
      setNotice('Payment submitted, waiting for the seller to release')
      await refreshAll()
    })
  }

  const releaseOrder = (order) => {
    if (!window.confirm('Release the escrowed GULU to the buyer?')) return
    run(async () => {
      await axios.post(`/api/p2p/orders/${order.id}/release`)
      setNotice('Order completed')
      await refreshAll()
    })
  }

  const cancelOrder = (order) => {
    const reason = window.prompt('Reason for cancelling this order')
    if (reason === null) return
    run(async () => {
      await axios.post(`/api/p2p/orders/${order.id}/cancel`, { reason })
      setNotice('Order cancelled')
      await refreshAll()
    })
  }

  const disputeOrder = (order) => {
    const reason = window.prompt('Describe the problem for the admin')
    if (reason === null) return
    run(async () => {
      await axios.post(`/api/p2p/orders/${order.id}/dispute`, { reason })
      setNotice('Dispute opened')
      await refreshAll()
    })
  }

  const activeAds = tab === 'buy' ? ads.sell : ads.buy

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">P2P / Deposit</h2>
          <p className="text-sm text-gray-500">Buy or sell GULU with fiat through approved merchants.</p>
        </div>
        <div className="flex gap-3">
          <div className={`${CARD} px-4 py-3 min-w-[150px]`}>
            <p className="text-xs uppercase tracking-wide text-gray-500">Available</p>
            <p className="text-xl font-bold text-brand-500">{fmt(profile.balance, 8)} GULU</p>
          </div>
          <div className={`${CARD} px-4 py-3 min-w-[150px]`}>
            <p className="text-xs uppercase tracking-wide text-gray-500">Locked</p>
            <p className="text-xl font-bold">{fmt(profile.locked, 8)} GULU</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              tab === item.key
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="p-3 rounded-xl text-sm bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {(tab === 'buy' || tab === 'sell') && (
        <div className="space-y-3">
          {activeAds.length === 0 && (
            <div className={`${CARD} p-8 text-center text-gray-500`}>
              No ads available right now.
            </div>
          )}
          {activeAds.map((ad) => (
            <div key={ad.id} className={`${CARD} p-4 flex flex-col lg:flex-row lg:items-center gap-4`}>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{ad.merchant.name}</span>
                  {ad.merchant.isBot && (
                    <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 text-xs font-semibold">
                      Bot
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{ad.merchant.completedOrders} completed</span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Limit {fmt(ad.minAmount)} - {fmt(ad.maxAmount)} {ad.fiat} | Available{' '}
                  {fmt(ad.available, 8)} GULU
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(ad.paymentMethods || []).map((method, index) => (
                    <span
                      key={`${ad.id}-${index}`}
                      className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-xs text-gray-600 dark:text-gray-300"
                    >
                      {method.type}
                      {method.name ? ` - ${method.name}` : ''}
                    </span>
                  ))}
                </div>
                {ad.terms && <p className="text-xs text-gray-500 mt-2">{ad.terms}</p>}
              </div>
              <div className="flex items-center justify-between lg:flex-col lg:items-end gap-3">
                <div className="text-right">
                  <div className="text-xl font-bold text-brand-500">
                    {fmt(ad.price)} <span className="text-sm">{ad.fiat}</span>
                  </div>
                  <div className="text-xs text-gray-500">per GULU</div>
                </div>
                <button
                  onClick={() => openOrder(ad)}
                  className={tab === 'buy' ? PRIMARY : DANGER}
                >
                  {tab === 'buy' ? 'Buy GULU' : 'Sell GULU'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className={`${CARD} p-8 text-center text-gray-500`}>You have no P2P orders yet.</div>
          )}
          {orders.map((order) => (
            <div key={order.id} className={`${CARD} p-4`}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        order.role === 'buyer'
                          ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {order.role === 'buyer' ? 'BUY' : 'SELL'}
                    </span>
                    <span className="font-semibold">{fmt(order.amount, 8)} GULU</span>
                    <StatusBadge map={ORDER_STATUS} value={order.status} />
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {fmt(order.fiatAmount)} {order.fiat} at {fmt(order.price)} {order.fiat}/GULU
                  </div>
                  <div className="text-sm text-gray-500">
                    Counterparty: {order.counterparty?.name}
                    {order.counterparty?.isBot ? ' (Bot)' : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{fmtDate(order.createdAt)}</div>
                  {order.paymentRef && (
                    <div className="text-xs text-gray-500">Payment ref: {order.paymentRef}</div>
                  )}
                  {order.cancelReason && (
                    <div className="text-xs text-red-500 mt-1">{order.cancelReason}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.canPay && (
                    <button onClick={() => openPay(order)} className={PRIMARY}>
                      Pay
                    </button>
                  )}
                  {order.canRelease && (
                    <button onClick={() => releaseOrder(order)} className={PRIMARY}>
                      Release
                    </button>
                  )}
                  {order.canCancel && (
                    <button onClick={() => cancelOrder(order)} className={GHOST}>
                      Cancel
                    </button>
                  )}
                  {order.canDispute && (
                    <button onClick={() => disputeOrder(order)} className={DANGER}>
                      Dispute
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'merchant' && (
        <div className="space-y-6">
          {!merchant && (
            <form onSubmit={submitApply} className={`${CARD} p-6 space-y-4 max-w-2xl`}>
              <div>
                <h3 className="text-lg font-bold">Become a merchant</h3>
                <p className="text-sm text-gray-500">
                  Apply to post P2P ads. An admin reviews your business details before you can trade.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Business name</label>
                <input
                  value={applyForm.businessName}
                  onChange={(e) => setApplyForm({ ...applyForm, businessName: e.target.value })}
                  className={FIELD}
                  placeholder="Your business or display name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact</label>
                <input
                  value={applyForm.contact}
                  onChange={(e) => setApplyForm({ ...applyForm, contact: e.target.value })}
                  className={FIELD}
                  placeholder="Telegram, email or phone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Note</label>
                <textarea
                  value={applyForm.note}
                  onChange={(e) => setApplyForm({ ...applyForm, note: e.target.value })}
                  className={FIELD}
                  rows={3}
                  placeholder="Tell the admin about your trading volume"
                />
              </div>
              <button type="submit" disabled={busy} className={PRIMARY}>
                Submit application
              </button>
            </form>
          )}

          {merchant && (
            <div className={`${CARD} p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">{merchant.businessName}</h3>
                  <p className="text-sm text-gray-500">{merchant.contact || 'No contact provided'}</p>
                </div>
                <StatusBadge map={MERCHANT_STATUS} value={merchant.status} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <div className="text-gray-500">Completed orders</div>
                  <div className="font-semibold">{merchant.completedOrders}</div>
                </div>
                <div>
                  <div className="text-gray-500">Max order</div>
                  <div className="font-semibold">{fmt(merchant.maxOrderGulu, 8)} GULU</div>
                </div>
                <div>
                  <div className="text-gray-500">Daily limit</div>
                  <div className="font-semibold">{fmt(merchant.dailyLimitGulu, 8)} GULU</div>
                </div>
              </div>
              {merchant.note && <p className="text-xs text-gray-500 mt-3">Note: {merchant.note}</p>}
              {merchant.status !== 'approved' && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                  {merchant.status === 'pending'
                    ? 'Your application is waiting for admin review.'
                    : 'Ad posting becomes available after approval.'}
                </p>
              )}
            </div>
          )}

          {merchant?.status === 'approved' && (
            <>
              <form onSubmit={submitAd} className={`${CARD} p-6 space-y-4`}>
                <div>
                  <h3 className="text-lg font-bold">Post a new ad</h3>
                  <p className="text-sm text-gray-500">
                    Sell GULU when you want users to buy from you; buy GULU when you want to acquire it.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Direction</label>
                    <select
                      value={adForm.side}
                      onChange={(e) => setAdForm({ ...adForm, side: e.target.value })}
                      className={FIELD}
                    >
                      <option value="sell">Sell GULU to users</option>
                      <option value="buy">Buy GULU from users</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Price (fiat per GULU)</label>
                    <input
                      type="number"
                      step="any"
                      value={adForm.price}
                      onChange={(e) => setAdForm({ ...adForm, price: e.target.value })}
                      className={FIELD}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Fiat</label>
                    <input
                      value={adForm.fiat}
                      onChange={(e) => setAdForm({ ...adForm, fiat: e.target.value.toUpperCase() })}
                      className={FIELD}
                      placeholder="CNY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Min fiat amount</label>
                    <input
                      type="number"
                      step="any"
                      value={adForm.minAmount}
                      onChange={(e) => setAdForm({ ...adForm, minAmount: e.target.value })}
                      className={FIELD}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Max fiat amount</label>
                    <input
                      type="number"
                      step="any"
                      value={adForm.maxAmount}
                      onChange={(e) => setAdForm({ ...adForm, maxAmount: e.target.value })}
                      className={FIELD}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Available GULU</label>
                    <input
                      type="number"
                      step="any"
                      value={adForm.available}
                      onChange={(e) => setAdForm({ ...adForm, available: e.target.value })}
                      className={FIELD}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Payment methods</label>
                    <button type="button" onClick={addMethodRow} className={GHOST}>
                      Add method
                    </button>
                  </div>
                  {adForm.paymentMethods.map((method, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <select
                        value={method.type}
                        onChange={(e) => updateMethod(index, 'type', e.target.value)}
                        className={FIELD}
                      >
                        {PAYMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <input
                        value={method.account}
                        onChange={(e) => updateMethod(index, 'account', e.target.value)}
                        className={FIELD}
                        placeholder="Account / card number"
                      />
                      <input
                        value={method.name}
                        onChange={(e) => updateMethod(index, 'name', e.target.value)}
                        className={FIELD}
                        placeholder="Account holder"
                      />
                      <button
                        type="button"
                        onClick={() => removeMethodRow(index)}
                        className={GHOST}
                        disabled={adForm.paymentMethods.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Terms</label>
                  <textarea
                    value={adForm.terms}
                    onChange={(e) => setAdForm({ ...adForm, terms: e.target.value })}
                    className={FIELD}
                    rows={2}
                    placeholder="Payment window or instructions"
                  />
                </div>

                <button type="submit" disabled={busy} className={PRIMARY}>
                  Publish ad
                </button>
              </form>

              <div className={`${CARD} p-6 space-y-3`}>
                <h3 className="text-lg font-bold">My ads</h3>
                {merchantAds.length === 0 && <p className="text-sm text-gray-500">No ads yet.</p>}
                {merchantAds.map((ad) => (
                  <div
                    key={ad.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            ad.side === 'sell'
                              ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {ad.side === 'sell' ? 'SELL' : 'BUY'}
                        </span>
                        <span className="font-semibold">
                          {fmt(ad.price)} {ad.fiat}
                        </span>
                        <StatusBadge map={AD_STATUS} value={ad.status} />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Limit {fmt(ad.minAmount)} - {fmt(ad.maxAmount)} {ad.fiat} | Available{' '}
                        {fmt(ad.available, 8)} GULU
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ad.status === 'active' ? (
                        <button onClick={() => setMerchantAdStatus(ad.id, 'paused')} className={GHOST}>
                          Pause
                        </button>
                      ) : (
                        <button onClick={() => setMerchantAdStatus(ad.id, 'active')} className={GHOST}>
                          Resume
                        </button>
                      )}
                      {ad.status !== 'closed' && (
                        <button onClick={() => closeMerchantAd(ad.id)} className={DANGER}>
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {orderAd && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className={`${CARD} w-full max-w-md p-6`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">
                  {orderAd.side === 'sell' ? 'Buy GULU' : 'Sell GULU'}
                </h3>
                <p className="text-sm text-gray-500">
                  {orderAd.merchant.name} | {fmt(orderAd.price)} {orderAd.fiat} per GULU
                </p>
              </div>
              <button
                onClick={() => setOrderAd(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Amount (GULU)</label>
                <input
                  type="number"
                  step="any"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  className={FIELD}
                  placeholder="0.00"
                />
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 text-sm space-y-2 tabular-nums">
                <div className="flex justify-between">
                  <span>{orderAd.side === 'sell' ? 'You pay' : 'You receive'}</span>
                  <span className="font-semibold">
                    {fmt(orderFiat)} {orderAd.fiat}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Limits</span>
                  <span>
                    {fmt(orderAd.minAmount)} - {fmt(orderAd.maxAmount)} {orderAd.fiat}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Available</span>
                  <span>{fmt(orderAd.available, 8)} GULU</span>
                </div>
              </div>
              {orderError && <p className="text-sm text-red-500">{orderError}</p>}
              <div className="flex gap-3">
                <button onClick={submitOrder} disabled={busy} className={`${PRIMARY} flex-1`}>
                  Place order
                </button>
                <button onClick={() => setOrderAd(null)} className={`${GHOST} flex-1`}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {payOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className={`${CARD} w-full max-w-md p-6`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">Pay {fmt(payOrder.fiatAmount)} {payOrder.fiat}</h3>
                <p className="text-sm text-gray-500">
                  Use the merchant account below, then submit the payment reference.
                </p>
              </div>
              <button
                onClick={() => setPayOrder(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Payment method</label>
                <select
                  value={payMethodIndex}
                  onChange={(e) => setPayMethodIndex(e.target.value)}
                  className={FIELD}
                >
                  {(payOrder.paymentMethods || []).length === 0 && (
                    <option value="">No methods available</option>
                  )}
                  {(payOrder.paymentMethods || []).map((method, index) => (
                    <option key={index} value={String(index)}>
                      {method.type} - {method.account}
                      {method.name ? ` (${method.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Payment reference</label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className={FIELD}
                  placeholder="Transaction id or note"
                />
              </div>
              {payError && <p className="text-sm text-red-500">{payError}</p>}
              <div className="flex gap-3">
                <button onClick={submitPay} disabled={busy} className={`${PRIMARY} flex-1`}>
                  I have paid
                </button>
                <button onClick={() => setPayOrder(null)} className={`${GHOST} flex-1`}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default P2P
