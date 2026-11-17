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
const jwt = require('jsonwebtoken')

const prisma = require('./db')
const { tickPrices } = require('./services/priceEngine')
const { tick: tickBook } = require('./services/marketMaker')
const { router: authRouter } = require('./routes/auth')

const app = express()
const server = http.createServer(app)

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const originCheck = (origin, cb) => {
  if (!origin) return cb(null, true)
  if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
  if (process.env.NODE_ENV !== 'production') return cb(null, true)
  cb(new Error(`cors rejected: ${origin}`))
}

const io = socketIo(server, {
  cors: {
    origin: (origin, cb) => originCheck(origin, cb),
    credentials: true,
    methods: ['GET', 'POST'],
  },
})

app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1)
app.set('io', io)
app.use(
  cors({
    origin: (origin, cb) => originCheck(origin, cb),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// API routes first: static hosting must never swallow /api/*
app.use('/api/auth', authRouter)
app.use('/api/admin', require('./routes/admin-coins'))
app.use('/api/admin', require('./routes/admin-bots'))
app.use('/api/admin', require('./routes/admin'))
app.use('/api/users', require('./routes/users'))
app.use('/api/market', require('./routes/market'))
app.use('/api/news', require('./routes/news'))
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/portfolio', require('./routes/portfolio'))
app.use('/api/competitions', require('./routes/competitions'))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() })
})

app.use('/api', (req, res) =>
  res.status(404).json({ success: false, message: `no such api: ${req.method} ${req.originalUrl}` })
)

app.use(require('./middleware/errorHandler'))

app.use((req, res) => res.status(404).json({ success: false, message: 'route not found' }))

// Private rooms are derived from a verified token, never from a client-supplied id
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      socket.data.userId = decoded.id
    } catch (e) {
      socket.data.userId = null
    }
  }
  next()
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

const priceTimer = setInterval(() => {
  tickPrices(io).catch((e) => console.error('[price] tick failed:', e.message))
}, 3000)

// Keeps the venue's own quotes present on both sides of every listed market
const bookTimer = setInterval(() => {
  tickBook(io).catch((e) => console.error('[book] tick failed:', e.message))
}, 6000)

tickBook(io).catch((e) => console.error('[book] initial tick failed:', e.message))

process.on('SIGTERM', () => {
  console.log('[boot] SIGTERM received, shutting down')
  clearInterval(priceTimer)
  clearInterval(bookTimer)
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0))
  })
})
