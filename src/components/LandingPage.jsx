
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { API_BASE } from '../utils/api'

const fmtPrice = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })

function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const [markets, setMarkets] = useState([])
  const [focusSymbol, setFocusSymbol] = useState('')
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] })
  const [marketError, setMarketError] = useState('')

  // The landing page shows the same public market feed as the dashboard; no
  // invented prices or projected returns are presented as platform data
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/market/prices`)
        if (!response.ok) throw new Error('market request failed')
        const payload = await response.json()
        if (cancelled) return
        const rows = Object.values(payload || {})
          .filter((row) => row && row.symbol && Number(row.price) > 0)
          .map((row) => ({
            symbol: row.symbol,
            name: row.name || row.symbol,
            price: Number(row.price),
            change24h: Number(row.change24h ?? row.change) || 0,
            volume24h: Number(row.volume24h ?? row.volume) || 0,
          }))
          .sort((a, b) => b.volume24h - a.volume24h || a.symbol.localeCompare(b.symbol))
        setMarkets(rows)
        setMarketError('')
        setFocusSymbol((prev) => prev || rows[0]?.symbol || '')
      } catch (error) {
        if (!cancelled) setMarketError('Live market data is unavailable right now.')
      }
    }

    load()
    const timer = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!focusSymbol) return
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/market/orderbook/${focusSymbol}?depth=5`)
        if (!response.ok) return
        const payload = await response.json()
        if (cancelled) return
        setOrderBook({ bids: payload.bids || [], asks: payload.asks || [] })
      } catch (error) {
        // Keep the last good snapshot rather than blanking the panel
      }
    }

    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [focusSymbol])

  return (
    <div className="bg-white text-gray-900 dark:bg-[#0A0F1A] dark:text-gray-100">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mt-4 mb-3 glass rounded-2xl shadow-glow">
            <div className="flex h-16 items-center justify-between px-4">
              <Link to="/" className="flex items-center gap-3">
                <svg className="w-9 h-9" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" fill="#0A84FF" opacity=".14"/>
                  <path d="M16 34c8-6 14-14 16-24 2 10 8 18 16 24-8 6-14 14-16 24-2-10-8-18-16-24z" fill="#10B981"/>
                  <path d="M24 24h16M20 32h24M24 40h16" stroke="#0A84FF" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
                <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                  <span className="text-brand-500">Eco</span>Trading<span className="text-emerald-500">Pro</span>
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-8">
                <a href="#features" className="hover:text-brand-500 transition">Features</a>
                <a href="#trading" className="hover:text-brand-500 transition">Trading</a>
                <a href="#faq" className="hover:text-brand-500 transition">FAQ</a>
              </div>

              <div className="flex items-center gap-3">
                <Link to="/auth/login" className="px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition font-semibold">
                  Sign In
                </Link>
                <button 
                  onClick={toggleTheme}
                  className="ml-1 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                  aria-label="Toggle theme"
                >
                  <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-36 pb-20 hero-gradient relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-24 w-[38rem] h-[38rem] rounded-full bg-brand-500/20 blur-3xl animate-blob"></div>
        <div className="pointer-events-none absolute top-40 -left-20 w-[28rem] h-[28rem] rounded-full bg-emerald-500/20 blur-3xl animate-blob" style={{animationDelay: '6s'}}></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full glass">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Markets • 24/7
              </p>
              <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold leading-tight">
                Trade smarter. <span className="text-brand-500">Invest</span> confidently.
              </h1>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 max-w-xl">
                Professional cryptocurrency trading platform with real-time data, advanced analytics, and a secure trading environment.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link to="/auth/register" className="px-6 py-3 rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition shadow-glow font-semibold">
                  Start Trading Free
                </Link>
                <a href="#features" className="px-6 py-3 rounded-xl border border-brand-500 text-brand-600 hover:bg-brand-50 dark:hover:bg-white/5 transition font-semibold">
                  Explore Features
                </a>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-5">
                <div className="glass rounded-xl p-4 text-center">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Settlement</dt>
                  <dd className="mt-2 text-2xl font-extrabold">GULU</dd>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Fiat Funding</dt>
                  <dd className="mt-2 text-2xl font-extrabold">P2P</dd>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <dt className="text-xs uppercase tracking-wider text-gray-500">Market Access</dt>
                  <dd className="mt-2 text-2xl font-extrabold">24/7</dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-6">
              <div className="relative">
                <div className="absolute -top-6 right-6 w-12 h-12 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 animate-float-slow shadow-glow"></div>

                <div className="glass rounded-3xl p-5 shadow-glow">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500">Live Markets</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">GULU pairs</span>
                  </div>
                  {markets.length === 0 ? (
                    <p className="text-sm text-gray-500 py-12 text-center">
                      {marketError || 'Loading live prices...'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {markets.slice(0, 5).map((market) => (
                        <div
                          key={market.symbol}
                          className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-xl px-4 py-3"
                        >
                          <div>
                            <div className="font-semibold">{market.symbol}/GULU</div>
                            <div className="text-xs text-gray-500">{market.name}</div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="font-semibold">{fmtPrice(market.price)} GULU</div>
                            <div className={`text-xs ${market.change24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%
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
        </div>
      </header>

      {/* Crypto Ticker */}
      <section className="py-3 border-y border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur">
        <div className="max-w-7xl mx-auto overflow-hidden px-4">
          <div className="flex gap-8 animate-marquee whitespace-nowrap text-sm font-medium">
            {markets.length === 0 && (
              <div className="flex items-center gap-2 text-gray-500">
                {marketError || 'Live market data is loading...'}
              </div>
            )}
            {markets.map((market) => (
              <div key={market.symbol} className="flex items-center gap-2">
                <span className="text-gray-500">{market.symbol}</span>
                <span>{fmtPrice(market.price)} GULU</span>
                <span className={market.change24h >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                  {market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold">Professional Trading Tools</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">Advanced tooling for professional traders and institutions.</p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-chart-line"></i></div>
              <h3 className="mt-4 font-semibold text-xl">Real-Time Data</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Live prices, order book depth and charts refreshed straight from the matching engine.</p>
            </article>

            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-shield-alt"></i></div>
              <h3 className="mt-4 font-semibold text-xl">Secure Environment</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Separate user and administrator authentication with full auditability.</p>
            </article>

            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-handshake"></i></div>
              <h3 className="mt-4 font-semibold text-xl">P2P Funding</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Buy and sell GULU with verified merchants using bank transfer, Alipay or WeChat Pay.</p>
            </article>

            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-newspaper"></i></div>
              <h3 className="mt-4 font-semibold text-xl">Market News</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Curated cryptocurrency news and market analysis to inform your trading decisions.</p>
            </article>

            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-sliders-h"></i></div>
              <h3 className="mt-4 font-semibold text-xl">Admin Control</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Comprehensive admin panel for user management, balance control, and platform oversight.</p>
            </article>

            <article className="group rounded-2xl p-6 border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 backdrop-blur hover:shadow-glow transition">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 text-white grid place-items-center shadow-glow"><i className="fas fa-mobile-alt"></i></div>
              <h3 className="mt-4 font-semibold text-xl">Responsive Design</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Mobile-first design with dark/light theme support for trading on any device.</p>
            </article>
          </div>
        </div>
      </section>

      {/* Portfolio Growth Section */}
      <section id="trading" className="py-20 bg-gradient-to-b from-white to-brand-50/40 dark:from-[#0A0F1A] dark:to-[#0B1324]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold">Trade like a professional</h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                Trade spot markets with your GULU balance. Every fill is matched on the platform's internal order book.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold"><i className="fas fa-check"></i></div>
                  <span>Fund instantly with GULU through P2P merchants</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold"><i className="fas fa-check"></i></div>
                  <span>Live prices, order book depth and trade history</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold"><i className="fas fa-check"></i></div>
                  <span>Limit, market, stop-loss and stop-limit orders</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold"><i className="fas fa-check"></i></div>
                  <span>Portfolio analytics and risk reporting</span>
                </div>
              </div>

              <Link to="/auth/register" className="mt-6 inline-block px-6 py-3 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition font-semibold">
                Start Trading
              </Link>
            </div>

            <div className="bg-white dark:bg-[#0B1324] border border-black/5 dark:border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold">{focusSymbol || 'GULU'}/GULU Order Book</span>
                <span className="text-[11px] text-gray-500">Live</span>
              </div>
              {orderBook.asks.length === 0 && orderBook.bids.length === 0 ? (
                <p className="text-sm text-gray-500 py-16 text-center">No resting orders right now.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm tabular-nums">
                  <div>
                    <div className="text-xs text-red-500 mb-2">Asks</div>
                    {orderBook.asks.slice(0, 5).reverse().map((level) => (
                      <div key={`ask-${level.price}`} className="flex justify-between py-1">
                        <span className="text-red-500">{fmtPrice(level.price)}</span>
                        <span className="text-gray-500">{Number(level.size).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-emerald-500 mb-2">Bids</div>
                    {orderBook.bids.slice(0, 5).map((level) => (
                      <div key={`bid-${level.price}`} className="flex justify-between py-1">
                        <span className="text-emerald-500">{fmtPrice(level.price)}</span>
                        <span className="text-gray-500">{Number(level.size).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-extrabold text-center">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-4">
            <details className="group rounded-xl border border-black/5 dark:border-white/5 p-4">
              <summary className="cursor-pointer font-semibold">Which markets are supported?</summary>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Every listed spot market is quoted against GULU. The live list, prices and 24h changes on this page and in the dashboard always reflect the current listings.</p>
            </details>
            <details className="group rounded-xl border border-black/5 dark:border-white/5 p-4">
              <summary className="cursor-pointer font-semibold">Which order types can I place?</summary>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Market, limit and stop orders, with live order status, fill price and full trade history available in the dashboard.</p>
            </details>
            <details className="group rounded-xl border border-black/5 dark:border-white/5 p-4">
              <summary className="cursor-pointer font-semibold">How is my account protected?</summary>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Passwords are stored with bcrypt hashing, sessions use signed JWTs with a fixed algorithm, every private data channel is token-bound, and all balance adjustments are recorded in an immutable ledger.</p>
            </details>
            <details className="group rounded-xl border border-black/5 dark:border-white/5 p-4">
              <summary className="cursor-pointer font-semibold">Do you offer an API?</summary>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Yes. The platform runs on public REST market-data endpoints and an authenticated WebSocket feed that pushes prices and executions in real time; the dashboard is built on the same interfaces.</p>
            </details>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 dark:border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <svg className="w-8 h-8" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" fill="#0A84FF" opacity=".14"/>
                  <path d="M16 34c8-6 14-14 16-24 2 10 8 18 16 24-8 6-14 14-16 24-2-10-8-18-16-24z" fill="#10B981"/>
                </svg>
                <span className="font-extrabold">EcoTradingPro</span>
              </div>
              <p className="mt-3 text-sm text-gray-500">Professional cryptocurrency trading platform.</p>
            </div>
            <div>
              <h4 className="font-semibold">Platform</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li><a href="#features" className="hover:text-brand-500">Features</a></li>
                <li><a href="#trading" className="hover:text-brand-500">Trading</a></li>
                <li><a href="#faq" className="hover:text-brand-500">FAQ</a></li>
                <li><Link to="/auth/login" className="hover:text-brand-500">Sign in</Link></li>
                <li><Link to="/auth/register" className="hover:text-brand-500">Create account</Link></li>
              </ul>
            </div>
          </div>
          <p className="mt-10 text-xs text-gray-500">&copy; {new Date().getFullYear()} EcoTradingPro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
