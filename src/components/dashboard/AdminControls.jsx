import React, { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import api from '../../utils/axios'
import { useWebSocket } from '../../contexts/WebSocketContext'

const card = 'backdrop-filter backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6'
const input = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-100'
const primaryBtn = 'px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50'
const ghostBtn = 'px-3 py-2 rounded-lg border border-gray-600 hover:border-gray-400 text-sm text-gray-200'
const dangerBtn = 'px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium'

export function CoinManagement() {
  const [coins, setCoins] = useState([])
  const [form, setForm] = useState({ symbol: '', name: '', price: '', volatility: '0.8', decimals: '2' })
  const [prices, setPrices] = useState({})
  const [deltaPct, setDeltaPct] = useState('')
  const [msg, setMsg] = useState('')

  const load = async () => {
    const res = await api.get('/api/admin/coins?includeDelisted=true')
    setCoins(res.data.coins || [])
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.response?.data?.message || 'Failed to load'))
  }, [])

  const create = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await api.post('/api/admin/coins', {
        symbol: form.symbol,
        name: form.name,
        price: Number(form.price),
        volatility: Number(form.volatility),
        decimals: Number(form.decimals),
      })
      setForm({ symbol: '', name: '', price: '', volatility: '0.8', decimals: '2' })
      await load()
      setMsg('Coin listed successfully')
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to list coin')
    }
  }

  const setPrice = async (symbol) => {
    const value = prices[symbol]
    if (value == null || value === '') return
    try {
      await api.post(`/api/admin/coins/${symbol}/price`, { price: Number(value) })
      await load()
      setMsg(`${symbol} price updated`)
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to update price')
    }
  }

  const release = async (symbol) => {
    await api.post(`/api/admin/coins/${symbol}/release`)
    await load()
  }

  const delist = async (symbol) => {
    await api.delete(`/api/admin/coins/${symbol}`)
    await load()
  }

  const restore = async (symbol) => {
    await api.post(`/api/admin/coins/${symbol}/restore`)
    await load()
  }

  const batch = async () => {
    const pct = Number(deltaPct)
    if (!Number.isFinite(pct) || !coins.length) return
    await api.post('/api/admin/prices/batch', {
      items: coins.filter((c) => !c.delisted).map((c) => ({ symbol: c.symbol, deltaPct: pct })),
    })
    await load()
    setMsg(`All coins adjusted by ${pct}%`)
  }

  return (
    <div className="space-y-6">
      <div className={card}>
        <h2 className="text-xl font-bold mb-4">Coin Management</h2>
        {msg && <p className="text-sm text-emerald-400 mb-3">{msg}</p>}
        <form onSubmit={create} className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <input className={input} placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required />
          <input className={input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={input} placeholder="Initial price" type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <input className={input} placeholder="Volatility" type="number" step="any" value={form.volatility} onChange={(e) => setForm({ ...form, volatility: e.target.value })} />
          <input className={input} placeholder="Decimals" type="number" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} />
          <button className={primaryBtn} type="submit">List</button>
        </form>

        <div className="flex items-center gap-3 mt-4">
          <input className={`${input} max-w-[160px]`} placeholder="Batch change %" type="number" step="any" value={deltaPct} onChange={(e) => setDeltaPct(e.target.value)} />
          <button className={ghostBtn} onClick={batch}>Apply to all</button>
        </div>
      </div>

      <div className={card}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700/50 text-gray-400">
                <th className="px-4 py-3 text-left">Coin</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Change</th>
                <th className="px-4 py-3 text-left">Set Price</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {coins.map((c) => (
                <tr key={c.symbol} className={c.delisted ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-100">{c.symbol}</div>
                    <div className="text-xs text-gray-400">{c.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-100">{Number(c.price).toFixed(c.decimals)}</td>
                  <td className="px-4 py-3">
                    <span className={c.controlled ? 'text-emerald-400' : 'text-gray-400'}>
                      {c.controlled ? 'Managed' : c.autoSync ? 'Auto' : 'Frozen'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 ${c.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.change24h > 0 ? '+' : ''}{c.change24h}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={`${input} max-w-[110px]`}
                        type="number"
                        step="any"
                        placeholder={String(c.price)}
                        value={prices[c.symbol] ?? ''}
                        onChange={(e) => setPrices({ ...prices, [c.symbol]: e.target.value })}
                      />
                      <button className={ghostBtn} onClick={() => setPrice(c.symbol)}>Set</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {c.controlled && <button className={ghostBtn} onClick={() => release(c.symbol)}>Release to auto</button>}
                      {c.delisted ? (
                        <button className={primaryBtn} onClick={() => restore(c.symbol)}>Restore</button>
                      ) : (
                        <button className={dangerBtn} onClick={() => delist(c.symbol)}>Delist</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!coins.length && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">No coins yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function BotFormation() {
  const [coins, setCoins] = useState([])
  const [groups, setGroups] = useState([])
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    symbol: '',
    target: '',
    mode: 'walk',
    speed: 1,
    intervalMs: 3000,
    avgSize: 1,
    intensity: 0.6,
    tolerance: 0.5,
    counterRate: 0.2,
    count: 3,
  })

  const loadStatus = async () => {
    const res = await api.get('/api/admin/bot-groups/status')
    setGroups(res.data.groups || [])
  }

  useEffect(() => {
    api.get('/api/admin/coins').then((res) => {
      const list = res.data.coins || []
      setCoins(list)
      if (list[0]) setForm((f) => ({ ...f, symbol: f.symbol || list[0].symbol }))
    })
    loadStatus().catch(() => {})
    const timer = setInterval(() => loadStatus().catch(() => {}), 3000)
    return () => clearInterval(timer)
  }, [])

  const start = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      const res = await api.post('/api/admin/bot-groups', {
        ...form,
        target: Number(form.target),
        speed: Number(form.speed),
        intervalMs: Number(form.intervalMs),
        avgSize: Number(form.avgSize),
        intensity: Number(form.intensity),
        tolerance: Number(form.tolerance) / 100,
        counterRate: Number(form.counterRate),
        count: Number(form.count),
      })
      setMsg(`Formation started with ${res.data.count} bots`)
      await loadStatus()
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to start')
    }
  }

  const stopGroup = async (id) => {
    await api.delete(`/api/admin/bot-groups/${id}`)
    await loadStatus()
  }

  const stopAll = async () => {
    await api.post('/api/admin/bot-groups/stop-all')
    await loadStatus()
  }

  const patchSpeed = async (botId, speed) => {
    await api.patch(`/api/admin/bot-groups/bots/${botId}`, { speed: Number(speed) })
  }

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Bot Formation</h2>
          <button className={dangerBtn} onClick={stopAll}>Stop All</button>
        </div>
        {msg && <p className="text-sm text-emerald-400 mb-3">{msg}</p>}
        <form onSubmit={start} className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <select className={input} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}>
            {coins.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
          </select>
          <input className={input} placeholder="Target price" type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required />
          <select className={input} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {['ramp', 'surge', 'stair', 'dump', 'walk'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className={input} placeholder="Bot count" type="number" min="1" max="20" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          <button className={primaryBtn} type="submit">Start Formation</button>

          <label className="text-xs text-gray-400">
            Speed {form.speed}
            <input type="range" min="0.5" max="5" step="0.1" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} className="w-full" />
          </label>
          <label className="text-xs text-gray-400">
            Interval ms
            <input className={input} type="number" value={form.intervalMs} onChange={(e) => setForm({ ...form, intervalMs: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">
            Order size
            <input className={input} type="number" step="any" value={form.avgSize} onChange={(e) => setForm({ ...form, avgSize: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">
            Intensity
            <input className={input} type="number" step="any" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })} />
          </label>
          <label className="text-xs text-gray-400">
            Tolerance %
            <input className={input} type="number" step="any" value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
          </label>
        </form>
      </div>

      <div className={card}>
        {!groups.length && <p className="text-gray-400 text-sm">No active formations</p>}
        {groups.map((g) => (
          <div key={g.id} className="mb-6 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-200">Formation {g.id}</h3>
              <button className={dangerBtn} onClick={() => stopGroup(g.id)}>Stop</button>
            </div>
            <div className="space-y-2">
              {g.bots.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-4 text-sm bg-gray-800/50 rounded-lg px-4 py-2">
                  <span className="text-gray-100">{b.name}</span>
                  <span className="text-gray-400">{b.symbol}</span>
                  <span className="text-gray-400">Target {b.target}</span>
                  <span className={b.stopped ? 'text-gray-500' : 'text-emerald-400'}>{b.stopped ? 'Stopped' : 'Running'}</span>
                  <label className="flex items-center gap-2 text-gray-400">
                    Speed
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.1"
                      defaultValue={b.speed}
                      onMouseUp={(e) => patchSpeed(b.id, e.target.value)}
                      onTouchEnd={(e) => patchSpeed(b.id, e.target.value)}
                    />
                    {b.speed}
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PriceChart() {
  const { socket } = useWebSocket()
  const [coins, setCoins] = useState([])
  const [symbol, setSymbol] = useState('')
  const [points, setPoints] = useState([])
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    api.get('/api/admin/coins').then((res) => {
      const list = res.data.coins || []
      setCoins(list)
      if (list[0]) setSymbol(list[0].symbol)
    })
  }, [])

  useEffect(() => {
    if (!socket) return
    const onPrice = (payload) => {
      const hit = (payload.prices || []).find((p) => p.symbol === symbol)
      if (!hit) return
      setPoints((prev) => [...prev.slice(-59), { t: Date.now(), p: hit.price }])
    }
    socket.on('price:update', onPrice)
    return () => socket.off('price:update', onPrice)
  }, [socket, symbol])

  useEffect(() => {
    setPoints([])
  }, [symbol])

  // The canvas is replaced when the panel unmounts, so the instance must be destroyed
  useEffect(() => () => {
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    const labels = points.map((pt) => new Date(pt.t).toLocaleTimeString())
    if (chartRef.current) {
      chartRef.current.data.datasets[0].label = `${symbol}/GULU`
      chartRef.current.data.labels = labels
      chartRef.current.data.datasets[0].data = points.map((pt) => pt.p)
      chartRef.current.update('none')
      return
    }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${symbol}/GULU`,
            data: points.map((pt) => pt.p),
            borderColor: '#10B981',
            backgroundColor: 'rgba(16,185,129,0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9CA3AF' } } },
        scales: {
          x: { ticks: { color: '#9CA3AF', maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    })
  }, [points, symbol])

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Price Trend</h2>
        <select className={`${input} max-w-[160px]`} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {coins.map((c) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
        </select>
      </div>
      <div className="h-80">
        <canvas ref={canvasRef}></canvas>
      </div>
      {!points.length && <p className="text-sm text-gray-400 mt-2">Waiting for live price updates...</p>}
    </div>
  )
}
