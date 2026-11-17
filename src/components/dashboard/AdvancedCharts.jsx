import React, { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import axios from '../../utils/axios'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale
)

const EMPTY = 'No data yet'

const fmtGulu = (value) => {
  const number = Number(value)
  return Number.isFinite(number)
    ? `${number.toLocaleString(undefined, { maximumFractionDigits: 8 })} GULU`
    : EMPTY
}

const timeframes = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' }
]

const INDICATORS = [
  { key: 'sma', label: 'SMA (20)' },
  { key: 'ema', label: 'EMA (20)' },
  { key: 'bollinger', label: 'Bollinger Bands' },
  { key: 'rsi', label: 'RSI (14)' },
  { key: 'macd', label: 'MACD' }
]

// Server indicators are shorter than the candle series; chart.js needs the
// leading gap so a 20-period average starts on the 20th candle, not the first
const padSeries = (series, length) => {
  if (!Array.isArray(series)) return []
  const offset = Math.max(0, length - series.length)
  return [...new Array(offset).fill(null), ...series]
}

function AdvancedCharts() {
  const [markets, setMarkets] = useState([])
  const [selectedAsset, setSelectedAsset] = useState('')
  const [timeframe, setTimeframe] = useState('1d')
  const [chartType, setChartType] = useState('line')
  const [indicators, setIndicators] = useState({
    sma: false,
    ema: false,
    bollinger: false,
    rsi: false,
    macd: false
  })
  const [chartData, setChartData] = useState(null)
  const [technicalData, setTechnicalData] = useState({})
  const [loading, setLoading] = useState(false)

  const enabledIndicators = Object.keys(indicators).filter((key) => indicators[key])
  const indicatorKey = enabledIndicators.join(',')

  useEffect(() => {
    axios
      .get('/api/market/list')
      .then((response) => {
        const list = Array.isArray(response.data?.data) ? response.data.data : []
        setMarkets(list)
        if (list.length) {
          const preferred = list.find((coin) => coin.symbol === 'BTC') || list[0]
          setSelectedAsset((current) => current || preferred.symbol)
        }
      })
      .catch((error) => console.error('[charts] market list failed', error.message))
  }, [])

  useEffect(() => {
    if (!selectedAsset) return
    let cancelled = false
    setLoading(true)
    axios
      .get(`/api/market/chart/${selectedAsset}`, {
        params: {
          timeframe,
          ...(indicatorKey ? { indicators: indicatorKey } : {})
        }
      })
      .then((response) => {
        if (cancelled) return
        setChartData(Array.isArray(response.data?.ohlcv) ? response.data.ohlcv : [])
        setTechnicalData(response.data?.indicators || {})
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[charts] chart fetch failed', error.message)
        setChartData([])
        setTechnicalData({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAsset, timeframe, indicatorKey])

  const toggleIndicator = (key) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const getChartConfig = () => {
    if (!chartData || !chartData.length) return null

    const labels = chartData.map((candle) => new Date(candle.timestamp))
    const closes = chartData.map((candle) => candle.close)
    const isArea = chartType === 'area'

    const datasets = [
      {
        label: `${selectedAsset}/GULU`,
        data: closes,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        borderWidth: 2,
        fill: isArea,
        pointRadius: 0,
        tension: 0.2
      }
    ]

    if (indicators.sma && technicalData.sma) {
      datasets.push({
        label: 'SMA (20)',
        data: padSeries(technicalData.sma, closes.length),
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        fill: false,
        pointRadius: 0
      })
    }

    if (indicators.ema && technicalData.ema) {
      datasets.push({
        label: 'EMA (20)',
        data: padSeries(technicalData.ema, closes.length),
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        fill: false,
        pointRadius: 0
      })
    }

    if (indicators.bollinger && technicalData.bollinger) {
      datasets.push(
        {
          label: 'BB Upper',
          data: padSeries(technicalData.bollinger.upper, closes.length),
          borderColor: 'rgba(168, 85, 247, 0.5)',
          borderWidth: 1,
          fill: false,
          pointRadius: 0
        },
        {
          label: 'BB Lower',
          data: padSeries(technicalData.bollinger.lower, closes.length),
          borderColor: 'rgba(168, 85, 247, 0.5)',
          borderWidth: 1,
          fill: '+1',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          pointRadius: 0
        }
      )
    }

    return { labels, datasets }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: timeframe.includes('m') ? 'minute' : timeframe.includes('h') ? 'hour' : 'day'
        }
      },
      y: { beginAtZero: false }
    },
    interaction: { mode: 'index', intersect: false }
  }

  const lastCandle = chartData && chartData.length ? chartData[chartData.length - 1] : null
  const rsiLabels = indicators.rsi && technicalData.rsi && chartData
    ? chartData.slice(Math.max(0, chartData.length - technicalData.rsi.length)).map((c) => new Date(c.timestamp))
    : []
  const macdLabels = chartData ? chartData.map((c) => new Date(c.timestamp)) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Advanced Charts</h2>
            <p className="text-gray-600 dark:text-gray-300">Price action, volume and technical indicators</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {markets.length === 0 && <option value="">No markets</option>}
              {markets.map((market) => (
                <option key={market.symbol} value={market.symbol}>{market.symbol}/GULU</option>
              ))}
            </select>

            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {timeframes.map((tf) => (
                <option key={tf.value} value={tf.value}>{tf.label}</option>
              ))}
            </select>

            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="line">Line Chart</option>
              <option value="area">Area Chart</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Chart Area */}
        <div className="xl:col-span-3">
          <div className="glass rounded-2xl p-6">
            <div className="h-96 lg:h-[600px]">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">Loading chart data...</div>
                </div>
              ) : getChartConfig() ? (
                <Line data={getChartConfig()} options={chartOptions} />
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <div className="text-gray-500">
                    No executed trades in this window yet.
                    <div className="text-xs mt-1">Candles are built only from real fills.</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Technical Indicators Panels */}
          {indicators.rsi && technicalData.rsi && (
            <div className="glass rounded-2xl p-6 mt-4">
              <h3 className="text-lg font-semibold mb-4">RSI (14)</h3>
              <div className="h-32">
                <Line
                  data={{
                    labels: rsiLabels,
                    datasets: [{
                      label: 'RSI',
                      data: technicalData.rsi,
                      borderColor: 'rgb(168, 85, 247)',
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      fill: true,
                      pointRadius: 0
                    }]
                  }}
                  options={{
                    ...chartOptions,
                    scales: {
                      ...chartOptions.scales,
                      y: {
                        min: 0,
                        max: 100,
                        grid: {
                          color: (context) => {
                            if (context.tick.value === 30 || context.tick.value === 70) {
                              return 'rgba(239, 68, 68, 0.5)'
                            }
                            return 'rgba(156, 163, 175, 0.2)'
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {indicators.macd && technicalData.macd && (
            <div className="glass rounded-2xl p-6 mt-4">
              <h3 className="text-lg font-semibold mb-4">MACD</h3>
              <div className="h-32">
                <Line
                  data={{
                    labels: macdLabels,
                    datasets: [
                      {
                        label: 'MACD',
                        data: technicalData.macd.macdLine,
                        borderColor: 'rgb(59, 130, 246)',
                        pointRadius: 0
                      },
                      {
                        label: 'Signal',
                        data: technicalData.macd.signalLine,
                        borderColor: 'rgb(239, 68, 68)',
                        pointRadius: 0
                      }
                    ]
                  }}
                  options={chartOptions}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tools Panel */}
        <div className="xl:col-span-1 space-y-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Technical Indicators</h3>
            <div className="space-y-3">
              {INDICATORS.map((indicator) => (
                <label key={indicator.key} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={indicators[indicator.key]}
                    onChange={() => toggleIndicator(indicator.key)}
                    className="mr-3 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>{indicator.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Market Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Open</span>
                <span className="font-semibold">{lastCandle ? fmtGulu(lastCandle.open) : EMPTY}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">High</span>
                <span className="font-semibold text-green-500">{lastCandle ? fmtGulu(lastCandle.high) : EMPTY}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Low</span>
                <span className="font-semibold text-red-500">{lastCandle ? fmtGulu(lastCandle.low) : EMPTY}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Close</span>
                <span className="font-semibold">{lastCandle ? fmtGulu(lastCandle.close) : EMPTY}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Volume</span>
                <span className="font-semibold">{lastCandle ? fmtGulu(lastCandle.volume) : EMPTY}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdvancedCharts
