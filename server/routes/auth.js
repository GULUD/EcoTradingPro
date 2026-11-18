const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const prisma = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
})

// Two counters: a strict per IP+account ceiling slows one source, while a higher
// per-account ceiling still stops a botnet without letting a stranger lock the owner out.
const FAILURE_WINDOW_MS = 60 * 60 * 1000
const PAIR_MAX = 10
const ACCOUNT_MAX = 50
const loginFailures = new Map()

const pairKey = (scope, email, ip) => `pair:${scope}:${String(email).toLowerCase()}:${ip || 'unknown'}`
const accountKey = (scope, email) => `account:${scope}:${String(email).toLowerCase()}`

function isLocked(key, max) {
  const record = loginFailures.get(key)
  if (!record) return false
  if (Date.now() - record.firstAt >= FAILURE_WINDOW_MS) {
    loginFailures.delete(key)
    return false
  }
  return record.count >= max
}

function recordFailure(key) {
  const now = Date.now()
  const record = loginFailures.get(key)
  if (!record || now - record.firstAt >= FAILURE_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAt: now })
  } else {
    record.count += 1
  }
  // Opportunistic cleanup so unique-email floods cannot grow the map forever
  if (loginFailures.size > 5000) {
    for (const [k, v] of loginFailures) {
      if (now - v.firstAt >= FAILURE_WINDOW_MS) loginFailures.delete(k)
    }
  }
}

const clearFailures = (key) => loginFailures.delete(key)

const sendLocked = (res) =>
  res.status(429).json({
    success: false,
    error: 'Too many failed attempts for this account, please try again later.',
  })

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' })

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  balance: user.balance,
  role: 'user',
  requireChange: user.mustChangePassword,
})

const publicAdmin = (admin) => ({
  id: admin.id,
  email: admin.email,
  firstName: admin.firstName || admin.name,
  lastName: admin.lastName || '',
  role: 'admin',
  permissions: admin.permissions,
  requireChange: admin.mustChangePassword,
})

router.post('/user/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, firstName, lastName } = req.body
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: 'All fields are required' })
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' })
    }

    const normalized = String(email).trim().toLowerCase()
    // The form checked this in the browser, but the API must not store unusable addresses
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' })
    }
    const first = String(firstName).trim()
    const last = String(lastName).trim()
    if (!first || !last || first.length > 60 || last.length > 60) {
      return res.status(400).json({ success: false, error: 'First and last name are required' })
    }
    const existing = await prisma.user.findUnique({ where: { email: normalized } })
    if (existing) {
      // Same wording as a failed signup for other reasons, so the endpoint cannot be used to enumerate accounts
      return res.status(400).json({ success: false, error: 'Unable to register with these details' })
    }

    const user = await prisma.user.create({
      data: {
        email: normalized,
        password: await bcrypt.hash(password, 12),
        firstName: first,
        lastName: last,
        // GULU is issued by the operator or bought P2P, never granted at signup
        balance: 0,
        isActive: true,
      },
    })

    res.status(201).json({
      success: true,
      token: generateToken(user.id, 'user'),
      user: publicUser(user),
      requireChange: false,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/user/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' })
    }

    const pair = pairKey('user', email, req.ip)
    const acct = accountKey('user', email)
    if (isLocked(pair, PAIR_MAX) || isLocked(acct, ACCOUNT_MAX)) return sendLocked(res)

    // Registration stores the trimmed lowercase address, so a stray space from
    // mobile keyboards must not turn a valid login into "invalid credentials"
    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
    if (!user) {
      recordFailure(pair)
      recordFailure(acct)
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }
    if (!(await bcrypt.compare(password, user.password))) {
      recordFailure(pair)
      recordFailure(acct)
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }
    // Only reveal the suspension to someone who proved ownership of the password
    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account has been suspended' })
    }

    clearFailures(pair)
    clearFailures(acct)
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

    res.json({
      success: true,
      token: generateToken(user.id, 'user'),
      user: publicUser(user),
      requireChange: user.mustChangePassword,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/admin/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' })
    }

    const pair = pairKey('admin', email, req.ip)
    const acct = accountKey('admin', email)
    if (isLocked(pair, PAIR_MAX) || isLocked(acct, ACCOUNT_MAX)) return sendLocked(res)

    const admin = await prisma.admin.findUnique({ where: { email: String(email).trim().toLowerCase() } })
    if (!admin) {
      recordFailure(pair)
      recordFailure(acct)
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' })
    }
    if (!(await bcrypt.compare(password, admin.password))) {
      recordFailure(pair)
      recordFailure(acct)
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' })
    }
    // Only reveal the suspension to someone who proved ownership of the password
    if (!admin.isActive) {
      return res.status(401).json({ success: false, error: 'Admin account has been suspended' })
    }

    clearFailures(pair)
    clearFailures(acct)
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLogin: new Date() } })

    res.json({
      success: true,
      token: generateToken(admin.id, 'admin'),
      user: publicAdmin(admin),
      requireChange: admin.mustChangePassword,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/me', authenticateToken, async (req, res) => {
  if (req.userRole === 'admin') {
    return res.json({ success: true, user: publicAdmin(req.user) })
  }
  res.json({ success: true, user: publicUser(req.user) })
})

router.post('/change-password', authLimiter, authenticateToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'newPassword must be at least 6 characters' })
    }

    const model = req.userRole === 'admin' ? prisma.admin : prisma.user
    if (!(await bcrypt.compare(currentPassword, req.user.password))) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' })
    }

    await model.update({
      where: { id: req.user.id },
      data: { password: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
    })
    res.json({ success: true, requireChange: false })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' })
})

module.exports = { router, authenticateToken }
