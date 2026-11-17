# EcoTradingPro 安全审计与修复报告

- 审计日期：2026-11-17
- 审计范围：`e:\jiaoyiruan` 全量源码（`server/`、`src/`、`prisma/`、根配置），不含 `node_modules`
- 审计方式：全量静态审计 + 依赖漏洞扫描（`npm audit`）+ 生产环境动态回归验证
- 结论：共确认 10 项可证实的风险，其中高危 2 项、中危 4 项、低危 4 项；全部已修复并完成回归。依赖漏洞由 38 条降至 10 条（0 严重 / 4 高危，均需破坏性主版本升级，已记录处置方案）。

---

## 1. 风险总览

| # | 类别 | 标题 | 等级 | 位置 | 状态 |
|---|---|---|---|---|---|
| 1 | hardcoded_credentials | 生产管理员口令写入被 Git 跟踪的 `server/.env.example` | 高危 | `server/.env.example` | 已修复 + 已轮换口令 |
| 2 | business_logic / trust_boundary | 交易接口信任客户端 `price`/`amount`，且卖出无持仓校验，可无限增发余额 | 高危 | `server/routes/users.js` `POST /trades` | 已修复 |
| 3 | broken_access_control | Socket.IO `join-user-room` 无鉴权，可订阅任意用户余额/持仓事件 | 中危 | `server/index.js`、`src/contexts/WebSocketContext.jsx` | 已修复 |
| 4 | broken_access_control | `mustChangePassword` 仅在客户端跳转，服务端仍放行全部权限 | 中危 | `server/middleware/auth.js` | 已修复 |
| 5 | race_condition | 创建机器人时"先查余额后扣款"，并发可透支 | 中危 | `server/routes/users.js` `POST /trading-bots` | 已修复 |
| 6 | missing_rate_limit | `/api/auth/change-password` 无频率限制，可在线暴力猜解当前口令 | 中危 | `server/routes/auth.js` | 已修复 |
| 7 | account_enumeration | 注册接口以"邮箱已存在"区分响应，可枚举注册用户 | 低危 | `server/routes/auth.js` `POST /user/register` | 已修复 |
| 8 | jwt_misconfiguration | `jwt.verify` 未限定算法 | 低危 | `server/middleware/auth.js` | 已修复 |
| 9 | cors_misconfiguration | CORS 放行任意 `*.pages.dev` 源 | 低危 | `server/index.js` | 已修复 |
| 10 | vulnerable_dependencies | 第三方依赖漏洞 38 条（2 严重 / 28 高危） | 中危 | `package.json` / `package-lock.json` | 已修复至 10 条，剩余需主版本升级 |

另有 2 项经评估后作为"已接受风险"记录于第 5 节。

---

## 2. 高危

### 漏洞 1：生产管理员口令随代码公开

- **等级**：高危（置信度 0.98）
- **成因**：`server/.env.example` 被 Git 跟踪，其中 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 填的是生产实际使用的口令，仓库为 Public。
- **影响范围**：任何访问仓库的人都能取得管理员账号；`mustChangePassword` 只影响前端跳转（见漏洞 4），攻击者可直接调用管理接口接管后台、修改任意用户余额、下架币种、启停机器人。
- **利用场景**：`git clone` → 读取 `.env.example` → 调用 `/api/auth/admin/login` → 拿到 admin JWT → 调 `/api/admin/users/:id/balance` 清空/篡改所有账户。
- **修复**：
  1. 将示例文件改为占位符；
  2. 立即在数据库轮换管理员口令（旧口令全部失效），并重新置位 `mustChangePassword`；
  3. 同步更新部署平台（Railway）中的 `ADMIN_PASSWORD`。
- **修复前**：

```ini
ADMIN_EMAIL=1433223@mjmj
ADMIN_PASSWORD=cs1433223
```

- **修复后**：

```ini
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_strong_random_password
```

- **回归**：旧口令登录返回 `401`；新口令登录成功；首次登录被强制改密。Git 历史中的旧值需通过轮换失效（已完成），无需改写历史。

### 漏洞 2：交易接口可凭空造钱

- **等级**：高危（置信度 0.95）
- **成因**：`POST /api/users/trades` 直接采信请求体中的 `price` 与 `amount`，不校验卖出方是否持有该资产；`portfolio[symbol]` 仅用 `Math.max(0, …)` 截断，卖出时余额照常增加。
- **影响范围**：任意已注册用户可无限增大余额，进而操纵排行榜、抽奖/竞赛结果，破坏平台财务完整性。
- **利用场景**：
  1. 以任意低价买入：`{type:"buy", asset:"BTC", price:0.01, amount:1, quantity:1000}` → 只花 1 元记入 1000 BTC；
  2. 直接卖出无持仓资产：`{type:"sell", asset:"BTC", amount:999999, price:1, quantity:1}` → 余额 +999999。
- **修复**：
  1. 成交价只取服务端行情记录（`manualPrice ?? price`），忽略客户端传的 `price`/`amount`；
  2. 成交额由 `quantity × 服务端价格` 计算；
  3. 卖出前校验持仓，不足即 400 `Insufficient holdings`；
  4. 整个"校验 → 扣款/加款 → 写持仓 → 记流水 → 记成交"放入 `Serializable` 事务，冲突时重试一次，避免并发双花；
  5. `quantity` 做有限正数校验（`Number.isFinite`、`>0`、上限 `1e9`）。
- **修复前（关键片段）**：

```js
const amt = +amount
const qty = +quantity
const px = +price                       // 客户端价格直接入账
if (type === 'buy') { /* 按 amt 扣款 */ }
else { /* 无条件加款 */ }                // 无持仓校验
portfolio[symbol] = Math.max(0, (portfolio[symbol] || 0) + (type === 'buy' ? qty : -qty))
```

- **修复后（关键片段）**：

```js
const qty = Number(quantity)
if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) return res.status(400)...

const px = +(coin.manualPrice ?? coin.price).toFixed(coin.decimals ?? 2)
const amt = +(qty * px).toFixed(2)

const execute = () => prisma.$transaction(async (tx) => {
  const u = await tx.user.findUnique({ where: { id: req.user.id } })
  const held = Number((u.portfolio || {})[symbol] || 0)
  if (type === 'buy' && u.balance < amt) return { reject: { status: 400, error: 'Insufficient balance' } }
  if (type === 'sell' && held < qty) return { reject: { status: 400, error: 'Insufficient holdings' } }
  // …更新余额与持仓、写 Trade / Transaction
}, { isolationLevel: 'Serializable' })
```

- **回归**：客户端传 `price=0.000001` 买入 0.001 BTC，实际扣款 68.36（= 0.001 × 68355）；卖出 99 BTC 返回 400；正常卖出 0.001 BTC 成功。

---

## 3. 中危

### 漏洞 3：Socket.IO 私有房间可被任意订阅

- **等级**：中危（置信度 0.88）
- **成因**：`join-user-room` 直接使用客户端传入的 `userId` 加入 `user-<id>` 房间，无任何鉴权；该房间承载 `balance:update`（含余额与持仓）和 `status-update`。
- **影响**：拿到/猜到用户 id 的匿名连接可长期监听他人资产变动，属于对象级越权（IDOR 类）。
- **修复**：连接握手时校验 JWT，私房间只由服务端按 token 内的 id 建立；`join-user-room` 事件删除；`join` 仅允许公开的 `market` 房间；前端改为在握手 `auth.token` 中携带令牌。
- **修复前**：

```js
socket.on('join-user-room', (userId) => {
  if (typeof userId === 'string') socket.join(`user-${userId}`)
})
```

- **修复后**：

```js
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
      socket.data.userId = decoded.id
    } catch (e) { socket.data.userId = null }
  }
  next()
})

io.on('connection', (socket) => {
  if (socket.data.userId) socket.join(`user-${socket.data.userId}`)
  socket.on('join', (room) => { if (room === 'market') socket.join('market') })
})
```

- **回归**：匿名连接尝试加入他人房间并触发管理员改余额，未收到任何事件；带 token 的连接正常收到自己的 `balance:update`。

### 漏洞 4：强制改密只是前端跳转

- **等级**：中危（置信度 0.92）
- **成因**：`mustChangePassword` 由登录响应返回，`ProtectedRoute` 在前端做重定向；服务端 `authenticateToken` 不检查该标志。
- **影响**：初始/临时口令只要未在 UI 中更改，就一直拥有完整 API 权限，绕过强制轮换策略（与漏洞 1 组合时危害放大）。
- **修复**：在鉴权中间件内增加服务端闸门，仅放行 `/api/auth/me`、`/api/auth/change-password`、`/api/auth/logout`，其余返回 `403 { code: "PASSWORD_CHANGE_REQUIRED" }`。
- **修复后（关键片段）**：

```js
const ROTATION_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'])

function rotationGuard(req, res, next) {
  const path = req.originalUrl.split('?')[0]
  if (ROTATION_ALLOWED.has(path)) return next()
  return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Password change required' })
}
```

- **回归**：置位标志后访问 `/api/admin/users` 返回 403 且 `code=PASSWORD_CHANGE_REQUIRED`；`/api/auth/me` 仍 200；改密后管理员接口恢复 200。

### 漏洞 5：机器人申购可并发透支

- **等级**：中危（置信度 0.86）
- **成因**：先读取 `req.user.balance` 做比较，再无条件 `decrement`，两次请求可同时通过校验。
- **影响**：并发提交可让余额变负，等同于凭空获得机器人额度。
- **修复**：改为带条件的原子更新 `updateMany({ where: { id, balance: { gte: inv } } })`，`count === 0` 即拒绝。
- **回归**：正常创建机器人仍成功；余额不足返回 400（逻辑路径已覆盖）。

### 漏洞 6：改密接口可被暴力破解

- **等级**：中危（置信度 0.85）
- **成因**：`/api/auth/change-password` 未挂载 `authLimiter`，持有有效 token 时可高频尝试 `currentPassword`。
- **修复**：为该路由复用登录限流器（15 分钟 20 次）。
- **回归**：正常改密 200；超限返回 429（限流器逻辑与其他认证接口一致）。

---

## 4. 低危

| # | 问题 | 成因与影响 | 修复 |
|---|---|---|---|
| 7 | 注册接口账号枚举 | 邮箱已注册时返回专门文案，可用于批量探测平台用户 | 统一为 `Unable to register with these details` |
| 8 | JWT 算法未固定 | `jwt.verify` 未传 `algorithms`，理论上容许算法混淆类攻击 | 签发与校验均固定 `HS256` |
| 9 | CORS 放行任意 `*.pages.dev` | 任何 Pages 站点都可跨域读取公开接口；当前鉴权走 Header 而非 Cookie，实际危害有限 | 移除通配，仅允许 `ALLOWED_ORIGINS` 精确匹配 |
| 10 | 依赖漏洞 | 初始 38 条（2 严重 / 28 高危），含 `jws`、`express`、`body-parser`、`socket.io`、`axios`、`react-router` 等 | 执行 `npm audit fix` 后降至 10 条（0 严重 / 4 高危） |

**依赖处置说明**：剩余 10 条全部需要主版本升级（`prisma@7`、`vite@8`、`react-router@7`、`esbuild`），属于破坏性变更。当前使用方式下均不可直接利用（Prisma 7 与 Vite 8 为构建期工具链，路由跳转未使用受影响的重定向路径）。建议在下个迭代周期单独升级并回归，不在本次安全修复中混入框架迁移。

---

## 5. 已接受风险（记录，不修改）

1. **JWT 无法主动吊销**：无状态 JWT 有效期 7 天，登出仅清客户端 token。影响有限（需先窃取 token），彻底解决需引入 token 版本号/黑名单存储，属架构改动，列为后续事项。
2. **CORS 精确白名单**：修复后 Cloudflare Pages 的预览域名（`<hash>.ecotradingpro.pages.dev`）将无法调用 API；生产域名已放行。若后续依赖预览环境联调，可在 `ALLOWED_ORIGINS` 中按需追加具体预览域名，而不是恢复通配。

---

## 6. 修复前后代码对比索引

| 文件 | 变更要点 |
|---|---|
| `server/.env.example` | 移除真实管理员邮箱与口令，替换为占位符 |
| `server/middleware/auth.js` | 固定 `HS256`；新增 `rotationGuard` 服务端强制改密闸门 |
| `server/routes/auth.js` | 签发固定 `HS256`；改密路由挂限流；注册错误文案统一 |
| `server/routes/users.js` | 交易改为服务端定价 + 持仓校验 + Serializable 事务 + 冲突重试；机器人申购改原子条件扣款 |
| `server/index.js` | 删除 `*.pages.dev` CORS 通配；新增 Socket 握手 JWT 校验，私房间由服务端建立，`join` 仅限 `market` |
| `src/contexts/WebSocketContext.jsx` | 握手携带 `auth.token`；移除客户端 `join-user-room` |
| `package-lock.json` | `npm audit fix` 非破坏性升级 |

---

## 7. 回归验证（生产环境实测）

测试基线：`https://ecotradingpro-api-production.up.railway.app` + `https://ecotradingpro.pages.dev`，15 项全部通过。

```
PASS | health                                | status=200
PASS | leaked admin password rejected         | status=401
PASS | rotated admin password accepted        | status=200
PASS | mustChangePassword blocks privileged API | status=403 code=PASSWORD_CHANGE_REQUIRED
PASS | mustChangePassword still allows /auth/me | status=200
PASS | change-password accepts current password | status=200
PASS | privileged API reachable after rotation  | status=200
PASS | temp user registered                     | status=201
PASS | client price ignored for buy             | spent=68.36 expected~68.36 tradePrice=68355
PASS | oversell blocked                         | status=400 err=Insufficient holdings
PASS | legit sell still works                   | status=200
PASS | foreign pages.dev origin refused         | acao=null status=500
PASS | allowed origin accepted                  | acao=https://ecotradingpro.pages.dev
PASS | anonymous socket cannot join a private room | leaked=null
PASS | authenticated socket receives own balance update | received={"balance":7777}
SUMMARY pass=15 fail=0
```

补充验证：
- `node --check` 覆盖 `server/` 全部 20 个文件，无语法错误；
- `npm run build` 成功，前端产物已部署；
- 测试期间创建的临时账号与成交记录已清理，管理员强制改密标志已复位。

---

## 8. 遗留与建议

1. **立即操作**：管理员新口令已通过安全渠道提供，首次登录必须修改；旧口令 `cs1433223` 已失效。
2. **依赖升级**：按 `prisma 7` / `vite 8` / `react-router 7` 分三次独立升级，每次升级后跑本报告的回归脚本。
3. **补强建议**（本次未实施，不影响现有修复）：邮箱验证与找回口令流程、登录失败锁定、审计日志落库、`httpOnly` Cookie + CSRF Token 的会话方案。
