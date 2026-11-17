const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// The engine module builds the Prisma client at import time
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') })
const { dedupeTrades } = require('../../server/services/matchingEngine')

test('user-to-user fill recorded on both sides counts once', () => {
  const rows = [
    { id: 'taker', time: 1000n, price: 10, size: 2, side: 'buy' },
    { id: 'maker', time: 1000n, price: 10, size: 2, side: 'sell' },
  ]
  const unique = dedupeTrades(rows)
  assert.equal(unique.length, 1)
})

test('separate fills at different times are kept', () => {
  const rows = [
    { id: 'a', time: 1000n, price: 10, size: 2 },
    { id: 'b', time: 1001n, price: 10, size: 2 },
  ]
  assert.equal(dedupeTrades(rows).length, 2)
})

test('same millisecond with different size or price is kept', () => {
  const rows = [
    { id: 'a', time: 1000n, price: 10, size: 2 },
    { id: 'b', time: 1000n, price: 10, size: 3 },
    { id: 'c', time: 1000n, price: 11, size: 2 },
  ]
  assert.equal(dedupeTrades(rows).length, 3)
})

test('house fills pass through unchanged', () => {
  const rows = [{ id: 'house', time: 1000n, price: 10, size: 1 }]
  assert.equal(dedupeTrades(rows).length, 1)
})
