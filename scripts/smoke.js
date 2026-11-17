// Minimal read-only smoke test: probes the API health endpoint.
// Usage: npm test
// Override the target with SMOKE_BASE (e.g. SMOKE_BASE=https://api.example.com).
const base = (process.env.SMOKE_BASE || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '')
const url = `${base}/api/health`

fetch(url, { signal: AbortSignal.timeout(5000) })
  .then(async (res) => {
    const body = await res.text()
    if (!res.ok) {
      console.error(`[smoke] ${url} -> HTTP ${res.status}`)
      process.exit(1)
    }
    let payload = null
    try {
      payload = JSON.parse(body)
    } catch {
      // handled below
    }
    if (!payload || payload.status !== 'ok') {
      console.error(`[smoke] unexpected response: ${body.slice(0, 200)}`)
      process.exit(1)
    }
    console.log(`[smoke] ok: ${url} (uptime ${Math.round(payload.uptime || 0)}s)`)
  })
  .catch((err) => {
    console.error(`[smoke] health check failed for ${url}: ${err.message}`)
    console.error('[smoke] start the API first (npm run server) or set SMOKE_BASE')
    process.exit(1)
  })
