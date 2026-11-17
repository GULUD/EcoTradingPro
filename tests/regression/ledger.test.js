const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') })
const prisma = require('../../server/db')

const close = (actual, expected, message) => {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-6, `${message}: expected ${expected}, got ${actual}`)
}

test.after(async () => {
  await prisma.$disconnect()
})

test('user balances never go negative', async () => {
  const negative = await prisma.user.count({ where: { OR: [{ balance: { lt: 0 } }, { locked: { lt: 0 } }] } })
  assert.equal(negative, 0)
})

test('minted supply equals balances plus escrow', async () => {
  const users = await prisma.user.aggregate({ _sum: { balance: true, locked: true } })
  const mint = await prisma.guluIssue.aggregate({ where: { type: 'mint' }, _sum: { amount: true } })
  const burn = await prisma.guluIssue.aggregate({ where: { type: 'burn' }, _sum: { amount: true } })
  const held = (users._sum.balance || 0) + (users._sum.locked || 0)
  const net = (mint._sum.amount || 0) - (burn._sum.amount || 0)
  close(held, net, 'ledger conservation')
})

test('escrow matches locked balances of open p2p orders', async () => {
  const users = await prisma.user.aggregate({ _sum: { locked: true } })
  const open = await prisma.p2POrder.aggregate({
    where: { status: { in: ['pending_payment', 'paid', 'disputed'] } },
    _sum: { amount: true },
  })
  close(users._sum.locked || 0, open._sum.amount || 0, 'escrow invariant')
})

test('orders never fill beyond their size', async () => {
  const rows = await prisma.$queryRaw`SELECT id, size, filled FROM "Order" WHERE filled > size LIMIT 5`
  assert.equal(rows.length, 0, `over-filled orders: ${JSON.stringify(rows)}`)
})

test('trades carry sane sizes and prices', async () => {
  const badTrades = await prisma.trade.count({ where: { OR: [{ size: { lte: 0 } }, { price: { lte: 0 } }] } })
  assert.equal(badTrades, 0)
})
