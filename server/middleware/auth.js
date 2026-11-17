const jwt = require('jsonwebtoken')
const prisma = require('../db')

// Routes a temporary-credential session may still call before it rotates its password
const ROTATION_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'])

function rotationGuard(req, res, next) {
  const path = req.originalUrl.split('?')[0]
  if (ROTATION_ALLOWED.has(path)) return next()
  return res
    .status(403)
    .json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Password change required' })
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' })
  }

  try {
    // Pin the algorithm so a token cannot request alg=none or an asymmetric swap
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded.role === 'admin') {
      const admin = await prisma.admin.findUnique({ where: { id: decoded.id } })
      if (!admin || !admin.isActive) {
        return res.status(401).json({ success: false, error: 'Invalid or inactive admin' })
      }
      req.user = admin
      req.userRole = 'admin'
      if (admin.mustChangePassword) return rotationGuard(req, res, next)
    } else if (decoded.role === 'user') {
      const user = await prisma.user.findUnique({ where: { id: decoded.id } })
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, error: 'Invalid or inactive user' })
      }
      req.user = user
      req.userRole = 'user'
      if (user.mustChangePassword) return rotationGuard(req, res, next)
    } else {
      return res.status(401).json({ success: false, error: 'Invalid token role' })
    }
    next()
  } catch (error) {
    res.status(403).json({ success: false, error: 'Invalid or expired token' })
  }
}

function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' })
  }
  next()
}

function requireUser(req, res, next) {
  if (req.userRole !== 'user') {
    return res.status(403).json({ success: false, error: 'User access required' })
  }
  next()
}

module.exports = { authenticateToken, requireAdmin, requireUser }
