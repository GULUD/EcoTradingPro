require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const bcrypt = require('bcryptjs')
const prisma = require('../db')

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.error('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set, skip')
    return
  }

  const exists = await prisma.admin.findUnique({ where: { email } })
  if (exists) {
    // Never touch an existing admin: the owner may already have changed the password
    console.log('[seed] admin already exists, skip')
    return
  }

  await prisma.admin.create({
    data: {
      email,
      password: await bcrypt.hash(password, 12),
      name: 'Administrator',
      firstName: 'System',
      lastName: 'Administrator',
      permissions: ['*'],
      mustChangePassword: true,
    },
  })
  console.log('[seed] admin created:', email)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[seed] failed:', e.message)
    await prisma.$disconnect()
    process.exit(1)
  })
