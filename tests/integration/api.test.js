const test = require('node:test')
const assert = require('node:assert/strict')

const API = process.env.API_BASE || 'https://ecotradingpro-api-production.up.railway.app'
const WEB = process.env.WEB_BASE || 'https://ecotradingpro.pages.dev'

const get = (path, headers = {}) => fetch(`${API}${path}`, { headers })

test('health endpoint is ok', async () => {
  const response = await get('/api/health')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'ok')
})

test('prices expose numeric quotes for listed pairs', async () => {
  const response = await get('/api/market/prices')
  assert.equal(response.status, 200)
  const body = await response.json()
  const pairs = Object.entries(body)
  assert.ok(pairs.length > 0, 'at least one pair')
  const priced = pairs.filter(([, quote]) => Number(quote.price) > 0)
  assert.ok(priced.length > 0, 'at least one priced market')
})

test('order book returns bids and asks arrays', async () => {
  const response = await get('/api/market/orderbook/BTC?depth=5')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.ok(Array.isArray(body.bids))
  assert.ok(Array.isArray(body.asks))
})

test('announcements and news are public arrays', async () => {
  const [announcements, news] = await Promise.all([get('/api/announcements'), get('/api/news')])
  assert.equal(announcements.status, 200)
  assert.equal(news.status, 200)
  assert.ok(Array.isArray(await announcements.json()))
  assert.ok(Array.isArray(await news.json()))
})

test('private endpoints reject anonymous callers', async () => {
  const paths = ['/api/users/orders', '/api/users/profile', '/api/users/alerts', '/api/announcements/admin', '/api/admin/users', '/api/p2p/ads']
  for (const path of paths) {
    const response = await get(path)
    assert.equal(response.status, 401, `${path} must be 401`)
  }
})

test('CORS allows the storefront and rejects unknown origins', async () => {
  const allowed = await get('/api/market/prices', { Origin: WEB })
  assert.equal(allowed.headers.get('access-control-allow-origin'), WEB)

  const blocked = await get('/api/market/prices', { Origin: 'https://evil.example' })
  assert.equal(blocked.status, 403)
})

test('API sends the expected security headers', async () => {
  const response = await get('/api/market/prices')
  assert.ok(response.headers.get('x-content-type-options'))
  assert.ok(response.headers.get('strict-transport-security'))
  assert.ok(response.headers.get('content-security-policy'))
})

test('storefront HTML is not cached and ships the hashed bundle', async () => {
  const response = await fetch(WEB)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') || '', /must-revalidate/)
  const html = await response.text()
  assert.match(html, /assets\/index-[A-Za-z0-9_-]+\.js/)
})

test('quotes respond within a sane budget', async () => {
  const started = Date.now()
  await get('/api/market/prices')
  assert.ok(Date.now() - started < 5000, 'prices responded under 5s')
})
