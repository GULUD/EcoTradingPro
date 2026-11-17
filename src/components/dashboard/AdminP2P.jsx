import React, { useEffect, useState } from 'react'
import axios from '../../utils/axios'

const card = 'backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6'
const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500'
const primaryBtn = 'px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50'
const ghostBtn = 'px-3 py-2 rounded-lg border border-gray-600 hover:border-gray-400 text-sm text-gray-200 disabled:opacity-50'
const dangerBtn = 'px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50'

const TABS = [
  { key: 'merchants', label: 'Merchants' },
  { key: 'orders', label: 'Orders' },
  { key: 'supply', label: 'Supply' },
]

const MERCHANT_STATUS = {
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
  suspended: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

const ORDER_STATUS = {
  pending_payment: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  paid: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  cancelled: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
  disputed: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

const STATUS_LABEL = {
  pending_payment: 'Pending payment',
  paid: 'Paid',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

const fmt = (value, digits = 8) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits })

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : '-')

function AdminP2P() {
  const [tab, setTab] = useState('merchants')
  const [merchantStatus, setMerchantStatus] = useState('all')
  const [orderStatus, setOrderStatus] = useState('all')
  const [merchants, setMerchants] = useState([])
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [supply, setSupply] = useState(null)
  const [issues, setIssues] = useState([])
  const [users, setUsers] = useState([])
  const [visibleAds, setVisibleAds] = useState([])
  const [limitEdits, setLimitEdits] = useState({})
  const [adForm, setAdForm] = useState({ id: '', type: 'bank', account: '', name: '', status: 'active' })
  const [issueForm, setIssueForm] = useState({ type: 'mint', userId: '', amount: '', note: '' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadStats = async () => {
    try {
      const response = await axios.get('/api/admin/p2p/stats')
      setStats(response.data)
    } catch (err) {
      // Stats are informational; a failure should not block the tables
    }
  }

  const loadMerchants = async (status) => {
    try {
      const response = await axios.get('/api/admin/p2p/merchants', { params: { status } })
      setMerchants(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load merchants')
    }
  }

  const loadOrders = async (status) => {
    try {
      const response = await axios.get('/api/admin/p2p/orders', { params: { status } })
      setOrders(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load orders')
    }
  }

  const loadSupply = async () => {
    try {
      const response = await axios.get('/api/admin/gulu/supply')
      setSupply(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load supply')
    }
  }

  const loadIssues = async () => {
    try {
      const response = await axios.get('/api/admin/gulu/issues')
      setIssues(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load issuance history')
    }
  }

  const loadUsers = async () => {
    try {
      const response = await axios.get('/api/admin/users')
      setUsers(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users')
    }
  }

  const loadVisibleAds = async () => {
    try {
      const [sellResponse, buyResponse] = await Promise.all([
        axios.get('/api/p2p/ads', { params: { side: 'sell' } }),
        axios.get('/api/p2p/ads', { params: { side: 'buy' } }),
      ])
      setVisibleAds([...(sellResponse.data.ads || []), ...(buyResponse.data.ads || [])])
    } catch (err) {
      setVisibleAds([])
    }
  }

  useEffect(() => {
    loadStats()
    loadSupply()
    loadIssues()
    loadUsers()
    loadVisibleAds()
  }, [])

  useEffect(() => {
    loadMerchants(merchantStatus)
  }, [merchantStatus])

  useEffect(() => {
    if (tab === 'orders') loadOrders(orderStatus)
  }, [tab, orderStatus])

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

  const reviewMerchant = (merchant, status) => {
    run(async () => {
      const payload = { status }
      const limit = Number(limitEdits[merchant.id] ?? merchant.maxOrderGulu)
      if (limit > 0) payload.maxOrderGulu = limit
      await axios.post(`/api/admin/p2p/merchants/${merchant.id}/review`, payload)
      setNotice(`${merchant.businessName} set to ${status}`)
      await Promise.all([loadMerchants(merchantStatus), loadStats()])
    })
  }

  const saveLimit = (merchant) => {
    const limit = Number(limitEdits[merchant.id])
    if (!(limit > 0)) {
      setError('Enter a max order amount greater than zero')
      return
    }
    run(async () => {
      await axios.post(`/api/admin/p2p/merchants/${merchant.id}/review`, {
        status: merchant.status,
        maxOrderGulu: limit,
      })
      setNotice(`Max order updated for ${merchant.businessName}`)
      await loadMerchants(merchantStatus)
    })
  }

  const resolveOrder = (order, action) => {
    const note = action === 'cancel' ? window.prompt('Reason for cancelling this order') : ''
    if (action === 'cancel' && note === null) return
    run(async () => {
      await axios.post(`/api/admin/p2p/orders/${order.id}/resolve`, { action, note: note || undefined })
      setNotice(`Order ${action === 'complete' ? 'completed' : 'cancelled'}`)
      await Promise.all([loadOrders(orderStatus), loadStats()])
    })
  }

  const saveAd = (event) => {
    event.preventDefault()
    const id = adForm.id.trim()
    if (!id) {
      setError('Ad id is required')
      return
    }
    if (!adForm.account.trim()) {
      setError('Payment account is required')
      return
    }
    run(async () => {
      await axios.patch(`/api/admin/p2p/ads/${id}`, {
        paymentMethods: [{ type: adForm.type, account: adForm.account.trim(), name: adForm.name.trim() }],
        status: adForm.status,
      })
      setNotice(`Ad ${id} updated`)
      await loadVisibleAds()
    })
  }

  const submitIssue = (event) => {
    event.preventDefault()
    const amount = Number(issueForm.amount)
    if (!issueForm.userId) {
      setError('Select a user')
      return
    }
    if (!(amount > 0)) {
      setError('Enter an amount greater than zero')
      return
    }
    run(async () => {
      await axios.post(`/api/admin/gulu/${issueForm.type}`, {
        userId: issueForm.userId,
        amount,
        note: issueForm.note,
      })
      setIssueForm({ type: issueForm.type, userId: issueForm.userId, amount: '', note: '' })
      setNotice(issueForm.type === 'mint' ? 'GULU minted' : 'GULU burned')
      await Promise.all([loadSupply(), loadIssues(), loadUsers(), loadStats()])
    })
  }

  const supplyCards = [
    { label: 'Total Minted', value: supply?.totalMinted },
    { label: 'Total Burned', value: supply?.totalBurned },
    { label: 'Total Supply', value: supply?.totalSupply },
    { label: 'Circulating', value: supply?.circulating },
    { label: 'Locked', value: supply?.locked },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">P2P / GULU</h2>
        <p className="text-gray-400 text-sm">Review merchants, arbitrate orders and control GULU supply.</p>
      </div>

      {notice && (
        <div className="p-3 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl text-sm bg-red-500/10 border border-red-500/30 text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-gray-700/50">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              tab === item.key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Merchants', value: stats.merchants },
            { label: 'Open Orders', value: stats.openOrders },
            { label: 'Completed', value: stats.completed },
            { label: 'Disputed', value: stats.disputed },
            { label: 'Escrowed GULU', value: fmt(stats.escrowed) },
          ].map((item) => (
            <div key={item.label} className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">{item.label}</p>
              <p className="text-xl font-bold mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'merchants' && (
        <div className="space-y-6">
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-xl font-bold">Merchants</h3>
              <select
                value={merchantStatus}
                onChange={(e) => setMerchantStatus(e.target.value)}
                className={`${input} max-w-[200px]`}
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 text-gray-400">
                    <th className="px-3 py-3 text-left">Merchant</th>
                    <th className="px-3 py-3 text-left">Email</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Balance / Locked</th>
                    <th className="px-3 py-3 text-left">Max order</th>
                    <th className="px-3 py-3 text-left">Completed</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {merchants.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        No merchants found.
                      </td>
                    </tr>
                  )}
                  {merchants.map((merchant) => (
                    <tr key={merchant.id} className="hover:bg-white/5">
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {merchant.businessName}
                          {merchant.isBot && (
                            <span className="ml-2 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs">Bot</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{merchant.userName}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-300">{merchant.email}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${MERCHANT_STATUS[merchant.status] || 'bg-gray-500/20 text-gray-300'}`}>
                          {merchant.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-gray-300">
                        {fmt(merchant.balance, 2)} / {fmt(merchant.locked, 2)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="any"
                            value={limitEdits[merchant.id] ?? merchant.maxOrderGulu}
                            onChange={(e) => setLimitEdits({ ...limitEdits, [merchant.id]: e.target.value })}
                            className={`${input} max-w-[120px]`}
                          />
                          <button onClick={() => saveLimit(merchant)} disabled={busy} className={ghostBtn}>
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-gray-300">{merchant.completedOrders}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {merchant.status !== 'approved' && (
                            <button onClick={() => reviewMerchant(merchant, 'approved')} disabled={busy} className={primaryBtn}>
                              Approve
                            </button>
                          )}
                          {merchant.status !== 'rejected' && (
                            <button onClick={() => reviewMerchant(merchant, 'rejected')} disabled={busy} className={dangerBtn}>
                              Reject
                            </button>
                          )}
                          {merchant.status !== 'suspended' && (
                            <button onClick={() => reviewMerchant(merchant, 'suspended')} disabled={busy} className={ghostBtn}>
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={card}>
            <h3 className="text-xl font-bold mb-2">Ads</h3>
            <p className="text-sm text-gray-400 mb-4">
              Bot ads stay hidden from the public list until a payment account is configured. Enter the ad id
              from the merchant page or database; use the list below to look up ids for visible ads.
            </p>
            <form onSubmit={saveAd} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                value={adForm.id}
                onChange={(e) => setAdForm({ ...adForm, id: e.target.value })}
                className={input}
                placeholder="Ad id"
                required
              />
              <select
                value={adForm.type}
                onChange={(e) => setAdForm({ ...adForm, type: e.target.value })}
                className={input}
              >
                <option value="bank">bank</option>
                <option value="alipay">alipay</option>
                <option value="wechat">wechat</option>
                <option value="usdt">usdt</option>
              </select>
              <input
                value={adForm.account}
                onChange={(e) => setAdForm({ ...adForm, account: e.target.value })}
                className={input}
                placeholder="Account / card number"
              />
              <input
                value={adForm.name}
                onChange={(e) => setAdForm({ ...adForm, name: e.target.value })}
                className={input}
                placeholder="Account holder"
              />
              <select
                value={adForm.status}
                onChange={(e) => setAdForm({ ...adForm, status: e.target.value })}
                className={input}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="closed">closed</option>
              </select>
              <button type="submit" disabled={busy} className={`${primaryBtn} md:col-span-5`}>
                Save payment account
              </button>
            </form>

            {visibleAds.length > 0 && (
              <div className="overflow-x-auto mt-6">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700/50 text-gray-400">
                      <th className="px-3 py-2 text-left">Ad id</th>
                      <th className="px-3 py-2 text-left">Side</th>
                      <th className="px-3 py-2 text-left">Merchant</th>
                      <th className="px-3 py-2 text-left">Price</th>
                      <th className="px-3 py-2 text-left">Available</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {visibleAds.map((ad) => (
                      <tr key={ad.id} className="hover:bg-white/5">
                        <td className="px-3 py-2 font-mono text-xs text-gray-300">{ad.id}</td>
                        <td className="px-3 py-2 uppercase text-gray-300">{ad.side}</td>
                        <td className="px-3 py-2 text-gray-300">{ad.merchant?.name}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-300">
                          {fmt(ad.price, 2)} {ad.fiat}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-300">{fmt(ad.available)}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setAdForm({ ...adForm, id: ad.id })}
                            className={ghostBtn}
                          >
                            Use id
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-bold">Orders</h3>
            <select
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className={`${input} max-w-[200px]`}
            >
              <option value="all">All statuses</option>
              <option value="pending_payment">Pending payment</option>
              <option value="paid">Paid</option>
              <option value="disputed">Disputed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50 text-gray-400">
                  <th className="px-3 py-3 text-left">Buyer</th>
                  <th className="px-3 py-3 text-left">Seller</th>
                  <th className="px-3 py-3 text-left">Amount</th>
                  <th className="px-3 py-3 text-left">Fiat</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Created</th>
                  <th className="px-3 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                      No orders found.
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-white/5">
                    <td className="px-3 py-3 text-gray-300">{order.buyerEmail}</td>
                    <td className="px-3 py-3 text-gray-300">{order.sellerEmail}</td>
                    <td className="px-3 py-3 tabular-nums text-gray-300">{fmt(order.amount)} GULU</td>
                    <td className="px-3 py-3 tabular-nums text-gray-300">
                      {fmt(order.fiatAmount, 2)} {order.fiat}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${ORDER_STATUS[order.status] || 'bg-gray-500/20 text-gray-300'}`}>
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-400">{fmtDate(order.createdAt)}</td>
                    <td className="px-3 py-3">
                      {(order.status === 'paid' || order.status === 'disputed') ? (
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => resolveOrder(order, 'complete')} disabled={busy} className={primaryBtn}>
                            Complete
                          </button>
                          <button onClick={() => resolveOrder(order, 'cancel')} disabled={busy} className={dangerBtn}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'supply' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {supplyCards.map((item) => (
              <div key={item.label} className="backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">{item.label}</p>
                <p className="text-xl font-bold mt-1 tabular-nums">{fmt(item.value)}</p>
              </div>
            ))}
          </div>

          <div className={card}>
            <h3 className="text-xl font-bold mb-4">Mint / Burn</h3>
            <form onSubmit={submitIssue} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select
                value={issueForm.type}
                onChange={(e) => setIssueForm({ ...issueForm, type: e.target.value })}
                className={input}
              >
                <option value="mint">Mint</option>
                <option value="burn">Burn</option>
              </select>
              <select
                value={issueForm.userId}
                onChange={(e) => setIssueForm({ ...issueForm, userId: e.target.value })}
                className={input}
                required
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email} ({fmt(user.balance, 2)} GULU)
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                value={issueForm.amount}
                onChange={(e) => setIssueForm({ ...issueForm, amount: e.target.value })}
                className={input}
                placeholder="Amount"
                required
              />
              <input
                value={issueForm.note}
                onChange={(e) => setIssueForm({ ...issueForm, note: e.target.value })}
                className={input}
                placeholder="Note"
              />
              <button type="submit" disabled={busy} className={primaryBtn}>
                {issueForm.type === 'mint' ? 'Mint GULU' : 'Burn GULU'}
              </button>
            </form>
          </div>

          <div className={card}>
            <h3 className="text-xl font-bold mb-4">Issuance history</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 text-gray-400">
                    <th className="px-3 py-3 text-left">Type</th>
                    <th className="px-3 py-3 text-left">Amount</th>
                    <th className="px-3 py-3 text-left">User</th>
                    <th className="px-3 py-3 text-left">Operator</th>
                    <th className="px-3 py-3 text-left">Note</th>
                    <th className="px-3 py-3 text-left">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {issues.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No issuance records.
                      </td>
                    </tr>
                  )}
                  {issues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-white/5">
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${issue.type === 'mint' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                          {issue.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-gray-300">{fmt(issue.amount)}</td>
                      <td className="px-3 py-3 text-gray-300">{issue.userEmail || issue.userId}</td>
                      <td className="px-3 py-3 text-gray-400">{issue.operator}</td>
                      <td className="px-3 py-3 text-gray-400">{issue.note || '-'}</td>
                      <td className="px-3 py-3 text-gray-400">{fmtDate(issue.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminP2P
