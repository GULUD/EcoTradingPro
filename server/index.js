// Resolve from repo root so `npm run server` and `npm start` share one env file
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

// Fail fast: a missing secret in production is worse than a crash at boot
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  console.error('[boot] JWT_SECRET missing or insecure, refusing to start')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('[boot] DATABASE_URL missing, refusing to start')
  process.exit(1)
}
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
  console.error('[boot] ALLOWED_ORIGINS required in production')
  process.exit(1)
}

const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')

const prisma = require('./db')
const { tickPrices } = require('./services/priceEngine')
const { tick: tickBook } = require('./services/marketMaker')
const { autoReleaseTick } = require('./services/p2pBot')
const { triggerStopOrders } = require('./services/stopOrders')
const { checkPriceAlerts } = require('./services/priceAlerts')
const { router: authRouter } = require('./routes/auth')

const app = express()
const server = http.createServer(app)

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const isOriginAllowed = (origin) => {
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return process.env.NODE_ENV !== 'production'
}

const io = socketIo(server, {
  cors: {
    // Socket.io cannot answer with a status code; just omit the CORS headers
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    credentials: true,
    methods: ['GET', 'POST'],
  },
})

// Never trust X-Forwarded-For blindly. Railway terminates TLS in front of the
// container, so one hop is trusted there; otherwise every caller shares the
// proxy IP and one attacker's auth attempts rate-limit the whole site.
const behindRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : behindRailway ? 1 : false)
app.set('io', io)
app.use(
  helmet({
    // The API is called cross-site by the Pages frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)
app.use((req, res, next) => {
  const origin = req.headers.origin
  // Reject unknown origins with a plain 403 instead of throwing into the error handler
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ success: false, error: 'origin not allowed' })
  }
  next()
})
app.use(
  cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

// API routes first: static hosting must never swallow /api/*
app.use('/api/auth', authRouter)
app.use('/api/admin', require('./routes/admin-coins'))
app.use('/api/admin', require('./routes/admin-bots'))
app.use('/api/admin', require('./routes/admin-p2p'))
app.use('/api/admin', require('./routes/admin'))
app.use('/api/users', require('./routes/users'))
app.use('/api/p2p', require('./routes/p2p'))
app.use('/api/market', require('./routes/market'))
app.use('/api/news', require('./routes/news'))
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/portfolio', require('./routes/portfolio'))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() })
})

app.use('/api', (req, res) =>
  res.status(404).json({ success: false, message: `no such api: ${req.method} ${req.originalUrl}` })
)

app.use(require('./middleware/errorHandler'))

app.use((req, res) => res.status(404).json({ success: false, message: 'route not found' }))

// Private rooms are derived from a verified token, never from a client-supplied id
io.use(async (socket, next) => {
  socket.data.userId = null
  const token = socket.handshake.auth && socket.handshake.auth.token
  if (!token) return next()
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    // A valid signature is not enough: the account may have been deleted or suspended
    const model = decoded.role === 'admin' ? prisma.admin : decoded.role === 'user' ? prisma.user : null
    if (!model) return next()
    const account = await model.findUnique({ where: { id: decoded.id } })
    if (account && account.isActive) socket.data.userId = decoded.id
    next()
  } catch (e) {
    // Invalid token or lookup failure: keep the socket anonymous
    next()
  }
})

io.on('connection', (socket) => {
  if (socket.data.userId) socket.join(`user-${socket.data.userId}`)

  socket.on('join', (room) => {
    if (room === 'market') socket.join('market')
  })
  socket.on('leave', (room) => {
    if (typeof room === 'string') socket.leave(room)
  })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, '0.0.0.0', async () => {
  console.log('[server] listening on', PORT, 'env:', process.env.NODE_ENV || 'development')
  console.log('[ws] socket.io attached at /socket.io')

  try {
    const { seedAll } = require('./database/init')
    await seedAll()
  } catch (e) {
    console.error('[seed] failed:', e.message)
  }
})

// Background jobs are opt-out so multi-instance deployments can run them on one node only
const JOBS_ENABLED = process.env.RUN_JOBS !== 'false'

// runJob keeps every tick isolated: a rejected promise must never stop the interval
const runJob = (name, fn) => {
  try {
    Promise.resolve(fn(io)).catch((e) => console.error(`[${name}] tick failed:`, e.message))
  } catch (e) {
    console.error(`[${name}] tick failed:`, e.message)
  }
}

let priceTimer = null
let bookTimer = null
let p2pTimer = null
let stopTimer = null
let alertTimer = null

if (JOBS_ENABLED) {
  priceTimer = setInterval(() => runJob('price', tickPrices), 3000)

  // Keeps the venue's own quotes present on both sides of every listed market
  bookTimer = setInterval(() => runJob('book', tickBook), 6000)
  runJob('book', tickBook)

  // Bot merchants release escrow a few seconds after a buyer marks the order paid
  p2pTimer = setInterval(() => runJob('p2p', autoReleaseTick), 5000)

  // Stop orders are checked against the price the engine just published
  stopTimer = setInterval(() => runJob('stops', triggerStopOrders), 3000)

  // Price alerts only need minute-level precision and the sweep scans users
  alertTimer = setInterval(() => runJob('alerts', checkPriceAlerts), 60000)
} else {
  console.log('[jobs] background jobs disabled (RUN_JOBS=false)')
}

process.on('SIGTERM', () => {
  console.log('[boot] SIGTERM received, shutting down')
  clearInterval(priceTimer)
  clearInterval(bookTimer)
  clearInterval(p2pTimer)
  clearInterval(stopTimer)
  clearInterval(alertTimer)
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0))
  })
})
