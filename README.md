EcoTradingPro

EcoTradingPro is a full-stack crypto simulation platform designed to provide users with a realistic cryptocurrency trading experience while giving administrators powerful oversight and simulation tools.

The platform features two distinct roles with separate authentication routes:
	•	Normal Users – interact with the platform as if trading real crypto.
	•	Admins – have exclusive rights to simulate balances, manage users, and oversee platform activity.

⸻

🚀 Features

👤 Users
	•	Register & log in through a user-specific auth route.
	•	View live crypto market rates (via CoinGecko API).
	•	Access curated crypto news and announcements.
	•	Participate in futures trading simulation with realistic balance tracking.
	•	Withdrawals disabled to maintain the simulation environment.
	•	Responsive dashboard with dark/light mode.

🛡️ Admins
	•	Secure login via a dedicated admin auth route.
	•	Simulate/edit balances across user accounts (users won’t know).
	•	Manage users (view, suspend, reset, or adjust accounts).
	•	Post announcements directly to user dashboards.
	•	Configure and manage crypto news feeds.
	•	Access platform analytics (activity logs, transactions, trends).

📊 System Highlights
	•	Modern React frontend with modular architecture.
	•	PostgreSQL database for secure and reliable storage.
	•	Real-time data integration with APIs.
	•	WebSocket support for live balance & price updates.
	•	Built with future expansion in mind (real trading support).

⸻

🗄️ Database Schema Overview
	•	users → stores user info, credentials, roles.
	•	admins → admin accounts with privileged access.
	•	balances → user balances (simulated).
	•	transactions → records of trades/futures.
	•	news → curated crypto news entries.
	•	announcements → admin-posted updates.
	•	market_data → real-time crypto rates.
	•	analytics → logs & platform insights.

⸻

🛠️ Tech Stack
	•	Frontend: React (Responsive, Dark/Light mode, Modular UI)
	•	Backend: Node.js / Express (Authentication, Business logic, Admin tools)
	•	Database: PostgreSQL
	•	APIs: CoinGecko (crypto rates), RSS feeds (crypto news)
	•	Auth: JWT with role-based separation (User vs Admin)
	•	Deployment: Render / Vercel / Docker

⸻

📌 Roadmap
	•	Project setup (frontend, backend, DB).
	•	Authentication (separate user/admin routes).
	•	User dashboard (balances, prices, news, futures).
	•	Admin dashboard (simulate balances, manage users, analytics).
	•	Real-time data integration (prices & WebSocket updates).
	•	UI/UX polish (dark/light mode, mobile responsiveness).
	•	Deployment & CI/CD pipeline.

⸻

📷 Preview (Concept)

EcoTradingPro dashboard mockups coming soon…

⸻

📄 License

MIT License – free to use and modify.


---

## Deployment

Frontend: Cloudflare Pages (static build in dist, SPA fallback via public/_redirects)
Backend: Render Web Service (Node, API + Socket.IO)
Database: Neon Serverless Postgres

### Render environment

| Key | Value |
| --- | --- |
| DATABASE_URL | Neon pooled connection, with ?sslmode=require&pgbouncer=true&connection_limit=1 |
| DIRECT_URL | Neon direct connection, with ?sslmode=require |
| JWT_SECRET | output of openssl rand -hex 32 |
| ALLOWED_ORIGINS | the Cloudflare Pages origin |
| TRUST_PROXY | 1 |
| ADMIN_EMAIL / ADMIN_PASSWORD | initial admin, seeded only when no admin exists |
| PRICE_SOURCE | none |

Build: npm install && npx prisma generate && npx prisma migrate deploy && node server/scripts/seedAdmin.js
Start: node server/index.js
Health check: /api/health

Keep the service awake with an external uptime monitor pointing at /api/health every 10 minutes, otherwise the free instance sleeps and the price and bot timers stop.

### Cloudflare Pages environment

| Key | Value |
| --- | --- |
| VITE_API_BASE | https://your-service.onrender.com |
| VITE_WS_BASE | https://your-service.onrender.com |

Build: npm run build
Output: dist

## Compliance

The admin panel can adjust user balances and move simulated prices. This capability is for local self-hosted simulation and testing only. Do not use it to solicit deposits from other people. Presenting fabricated market data to induce investment can be a criminal offence in many jurisdictions. This project provides no real asset matching, custody, or deposit and withdrawal channel.
