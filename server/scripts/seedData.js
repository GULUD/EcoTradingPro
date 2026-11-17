require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const prisma = require('../db')
const { seedAll } = require('../database/init')

seedAll()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('[seed] failed:', e.message)
    await prisma.$disconnect()
    process.exit(1)
  })
