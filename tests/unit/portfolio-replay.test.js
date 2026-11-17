const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// The service module builds the Prisma client at import time
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') })
const portfolioService = require('../../server/services/portfolioService')
const { replayTrades } = portfolioService

// Fills follow the engine's shape: buys are credited net of the base-asset fee
const buy = (id, symbol, size, price, time) => ({ id, symbol, side: 'buy', size, price, time })
const sell = (id, symbol, size, price, time) => ({ id, symbol, side: 'sell', size, price, time })

const close = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, got ${actual}`)
}

test('round trip keeps cost basis and reports realized profit', () => {
  const { books, pnlById, sells, realized } = replayTrades([
    buy('b1', 'BTC', 1, 100, 1),
    sell('s1', 'BTC', 0.999, 150, 2),
  ])

  assert.equal(sells.length, 1)
  close(pnlById.get('s1'), 49.70015, 'realized pnl')
  close(realized, 49.70015, 'total realized')
  close(books.get('BTC').qty, 0, 'position closed')
  close(books.get('BTC').cost, 0, 'cost cleared')
})

test('average cost blends multiple buys before a sell', () => {
  const { books, pnlById } = replayTrades([
    buy('b1', 'ETH', 1, 100, 1),
    buy('b2', 'ETH', 1, 200, 2),
    sell('s1', 'ETH', 1, 250, 3),
  ])

  close(pnlById.get('s1'), 99.59985, 'pnl against blended cost')
  close(books.get('ETH').qty, 0.998, 'remaining base after sell')
  close(books.get('ETH').cost, 149.84985, 'remaining cost basis')
})

test('selling holdings with no tracked basis does not invent profit', () => {
  const { pnlById, realized, sells } = replayTrades([sell('s1', 'ADA', 1, 100, 1)])

  close(pnlById.get('s1') ?? 0, 0, 'untracked sale is flat')
  close(realized, 0, 'no realized profit')
  close(sells[0].pnl, 0, 'sale row is flat')
})

test('partially tracked sale only counts the tracked share', () => {
  const { pnlById } = replayTrades([
    buy('b1', 'SOL', 0.5, 100, 1),
    sell('s1', 'SOL', 1, 200, 2),
  ])

  close(pnlById.get('s1'), 49.8001, 'proportional proceeds minus cost')
})

test('symbols are tracked independently', () => {
  const { books, realized } = replayTrades([
    buy('b1', 'BTC', 1, 100, 1),
    buy('b2', 'ETH', 1, 50, 2),
  ])

  close(books.get('BTC').qty, 0.999, 'btc quantity')
  close(books.get('ETH').qty, 0.999, 'eth quantity')
  close(realized, 0, 'no sells yet')
})
