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

    const normalized = String(email).toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email: normalized } })
    if (existing) {
      // Same wording as a failed signup for other reasons, so the endpoint cannot be used to enumerate accounts
      return res.status(400).json({ success: false, error: 'Unable to register with these details' })
    }

    const user = await prisma.user.create({
      data: {
        email: normalized,
        password: await bcrypt.hash(password, 12),
        firstName,
        lastName,
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

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } })
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account has been suspended' })
    }
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }

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

    const admin = await prisma.admin.findUnique({ where: { email: String(email).toLowerCase() } })
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' })
    }
    if (!admin.isActive) {
      return res.status(401).json({ success: false, error: 'Admin account has been suspended' })
    }
    if (!(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' })
    }

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
