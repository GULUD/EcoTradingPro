// Kept in one place so registration and password rotation enforce the same rules
const WEAK = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  'qwerty123',
  '11111111',
  'abc12345',
  'iloveyou',
  'admin123',
  '66666666',
])

function passwordProblem(value) {
  if (typeof value !== 'string' || value.length < 8) return 'Password must be at least 8 characters'
  if (value.length > 72) return 'Password must be at most 72 characters'
  if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter'
  if (!/\d/.test(value)) return 'Password must include a number'
  if (WEAK.has(value.toLowerCase())) return 'Password is too common'
  if (/(.)\1{3,}/.test(value)) return 'Password repeats a character too many times'
  return null
}

module.exports = { passwordProblem }
