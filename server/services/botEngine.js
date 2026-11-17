const prisma = require('../db')

const groups = new Map()

// Human order sizes follow a lognormal distribution, not a fixed value
function lognormal(mu = 0, sigma = 0.8) {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
}

const PREFIX = ['trader', 'whale', 'alpha', 'quant', 'degen', 'nova', 'delta']
const pick = (a) => a[Math.floor(Math.random() * a.length)]

async function step(bot, io) {
  const c = await prisma.marketData.findUnique({ where: { symbol: bot.symbol } })
  if (!c || c.delisted || bot.stopped) return

  const anchor = c.manualPrice ?? c.price
  if (!anchor) return
  const gap = (bot.target - anchor) / anchor

  // Stop inside tolerance so the bot does not overshoot the target
  if (Math.abs(gap) < bot.tolerance) {
    bot.stopped = true
    io.emit('bot:done', { id: bot.id, reason: 'target reached' })
    return
  }

  const up = gap > 0
  const progress = Math.min(1, Math.abs(gap) / Math.abs(bot.startGap || gap))
  const ease = Math.max(0.15, progress)

  let intensity = bot.intensity * ease
  if (bot.mode === 'surge') intensity *= progress > 0.6 ? 0.5 : 1.6
  if (bot.mode === 'stair') intensity *= Math.sin(Date.now() / 4000) > 0.3 ? 1.4 : 0.2
  if (bot.mode === 'dump') intensity *= 1.5

  const qty = +lognormal(Math.log(bot.avgSize), 0.7).toFixed(c.decimals)
  // Never print a zero-size fill or move the price without a trade behind it
  if (!(qty > 0)) return
  const impact = (up ? 1 : -1) * Math.abs(gap) * 0.02 * intensity * (0.5 + Math.random())
  const noise = ((Math.random() - 0.5) * c.volatility) / 100 * anchor
  const next = +(anchor * (1 + impact) + noise).toFixed(c.decimals)

  const counter = Math.random() < (bot.counterRate ?? 0.2)
  const side = counter ? (up ? 'sell' : 'buy') : up ? 'buy' : 'sell'
  const visible = +(qty * (0.2 + Math.random() * 0.3)).toFixed(c.decimals)

  const open = c.open24h || next
  const change24h = +(((next - open) / open) * 100).toFixed(2)
  await prisma.marketData.update({
    where: { symbol: bot.symbol },
    data: {
      manualPrice: next,
      price: next,
      open24h: open,
      volume24h: { increment: qty * next },
      change24h,
    },
  })

  await prisma.trade.create({
    data: {
      userId: bot.shadowUserId || null,
      symbol: bot.symbol,
      side,
      size: visible,
      price: next,
      pnl: 0,
      source: 'bot',
      botName: bot.name,
      time: BigInt(Date.now()),
    },
  })

  io.to('market').emit('trade:executed', {
    symbol: bot.symbol,
    side,
    size: visible,
    price: next,
    time: Date.now(),
  })
  io.to('market').emit('price:update', {
    prices: [{ symbol: bot.symbol, price: next, change24h }],
    timestamp: Date.now(),
  })

  if (Math.random() < 0.4) {
    io.to('market').emit('depth:update', {
      symbol: bot.symbol,
      side: side === 'buy' ? 'sell' : 'buy',
      price: +(next * (1 + (Math.random() - 0.5) * 0.004)).toFixed(c.decimals),
      size: +lognormal(Math.log(bot.avgSize), 0.9).toFixed(c.decimals),
    })
  }
}

function startGroup(io, cfg) {
  const id = cfg.id || `g_${Date.now().toString(36)}`
  const bots = cfg.bots
    // A zero interval or speed used to produce a 1ms loop that hammered the database
    .filter((b) => Number.isFinite(Number(b.target)) && Number(b.target) > 0)
    .map((b, i) => ({
      ...b,
      id: `${id}_${i}`,
      name: b.name || `${pick(PREFIX)}_${Math.random().toString(36).slice(2, 7)}`,
      intervalMs: Math.max(500, Number(b.intervalMs) || 3000),
      speed: Math.max(0.1, Number(b.speed) || 1),
      avgSize: Number(b.avgSize) > 0 ? Number(b.avgSize) : 1,
      startGap: (b.target - (b.startPrice || b.target)) / (b.startPrice || b.target),
      stopped: false,
    }))
  bots.forEach((b) => {
    const loop = async () => {
      if (b.stopped) return
      await step(b, io).catch((e) => console.error('[bot] step failed:', e.message))
      const jitter = 0.5 + Math.random() * 1.5
      // Read b.speed every round so a slider change takes effect without restart
      b.timer = setTimeout(loop, (b.intervalMs * jitter) / b.speed)
    }
    b.timer = setTimeout(loop, Math.random() * b.intervalMs)
  })
  groups.set(id, { bots })
  console.log('[bot] group', id, 'started with', bots.length, 'bot(s)')
  return id
}

function stopGroup(id) {
  const g = groups.get(id)
  if (!g) return false
  g.bots.forEach((b) => {
    b.stopped = true
    if (b.timer) clearTimeout(b.timer)
  })
  groups.delete(id)
  return true
}

function stopAll() {
  for (const id of [...groups.keys()]) stopGroup(id)
}

function updateBot(botId, patch) {
  for (const g of groups.values()) {
    const b = g.bots.find((x) => x.id === botId)
    if (b) {
      const next = { ...patch }
      if (next.speed != null) next.speed = Math.max(0.1, Number(next.speed) || 1)
      if (next.intervalMs != null) next.intervalMs = Math.max(500, Number(next.intervalMs) || 3000)
      if (next.target != null) next.target = Number(next.target) > 0 ? Number(next.target) : b.target
      Object.assign(b, next)
      return true
    }
  }
  return false
}

function status() {
  return [...groups.entries()].map(([id, g]) => ({
    id,
    bots: g.bots.map((b) => ({
      id: b.id,
      name: b.name,
      symbol: b.symbol,
      target: b.target,
      mode: b.mode,
      speed: b.speed,
      stopped: b.stopped,
    })),
  }))
}

module.exports = { startGroup, stopGroup, stopAll, updateBot, status }
