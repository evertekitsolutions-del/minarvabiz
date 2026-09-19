# MINARVA BIZ

**Commercial Boutique Billing & Management Software**  
Online · Offline (Windows) · Hybrid

Built for real boutique, tailoring, and laundry shops.

---

## Current commercial release

**Version 1.0.4** — current customer-delivery candidate. Automated Windows install/click/deep-smoke gates pass; physical customer-PC UAT remains the final delivery gate.

## Editions

| Edition | Target | Database | Sync |
|---------|--------|----------|------|
| **Online** | Browser (Next.js 15) | Supabase PostgreSQL | — |
| **Offline** | Windows (Electron) | SQLite | — |
| **Hybrid** | Desktop + cloud | SQLite + Supabase | Outbox + conflicts |

---

## Modules (Phases 1–51 + completion pass)

| Area | Features |
|------|----------|
| **Core** | Monorepo, shared types/UI/business logic, dual DB schemas |
| **Dashboard** | Premium layout matching reference UI, KPI cards, charts |
| **Commerce** | Customers, products, inventory, POS sales, payments |
| **Services** | Tailoring, alterations, measurements, wedding, bulk, T-shirt |
| **Ops** | Laundry/ironing, suppliers, expenses, purchases |
| **People** | Staff, assignments, incentives, CRM profiles, notifications |
| **Governance** | Reports, day-end, returns/refunds, audit log, backup/restore |
| **Sync** | Offline outbox, conflict strategies, device sessions |
| **License** | Ed25519 activation, plan limits, grace, multi-branch foundation |
| **Production** | Feature gates, Electron security shell, env hardening, docs |
| **Persistence** | Repository pattern, SQLite/Postgres DDL, local auth, license-admin issuer |
| **Desktop pack** | SQLite durable store, Electron IPC DB, electron-builder config |
| **Persistence bridge** | Domain snapshot export/import, AuthGate, Supabase skeleton |
| **Full hydrate** | All domain stores hydrate with controlled local bootstrap |
| **Ops polish** | Auto-save on mutations, receipt print, logout, optional auth |
| **Live ops** | Live dashboard metrics, shop profile, order receipts |
| **Collections** | Customer payments, day-end close, message templates |
| **18–50** | Tax, labels, stock take, delivery, loyalty, CSV, CI, release |
| **51** | Real Supabase PostgREST, migrations+RLS, dual-write, profit tests |

---

## Repository layout

```
apps/
  web/                 Next.js App Router (Online UI)
  desktop/             Electron + React (Offline / Hybrid shell)
  license-admin/       License issuance panel
packages/
  ui/                  Shared components (AppShell, dashboard, modules)
  business-logic/      Domain logic and local stores
  database/            Schema foundations (Postgres + SQLite)
  licensing/           Tokens, fingerprint, limits, activation
  sync/                Outbox, engine, conflict resolution
  billing/             Line-item / invoice math
  types/ validation/ utils/
docs/
  ARCHITECTURE.md  DATABASE.md  LICENSING.md  PRODUCTION.md
```

---

## Quick start

```bash
pnpm install
cp .env.example .env
# Fill the required environment values.
pnpm dev:web            # http://localhost:3000
pnpm typecheck
pnpm --filter @minarvabiz/web build
```

## Windows packaging

From the repository root on Windows PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @minarvabiz/desktop run package:win
```

Or use the helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

For the current release the installer is `apps/desktop/release/MinarvaBiz-Setup-1.0.4.exe`. The helper script is version-independent and discovers `MinarvaBiz-Setup-*.exe` automatically.

## Verification commands

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @minarvabiz/web exec tsc --noEmit
pnpm --filter @minarvabiz/web build
pnpm --filter @minarvabiz/database typecheck
pnpm --filter @minarvabiz/business-logic typecheck
pnpm --filter @minarvabiz/ui typecheck
pnpm --filter @minarvabiz/desktop typecheck
pnpm --filter @minarvabiz/desktop build:renderer
pnpm --filter @minarvabiz/desktop build:electron
node scripts/quality-smoke.mjs
node scripts/smoke.mjs
```

## Production environment

Required production configuration includes:

- `NODE_ENV=production`
- `APP_VERSION=1.0.4`
- `APP_EDITION=online` or `hybrid`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser-safe anon key
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `SUPABASE_SECRET_KEY` when required by server integrations — server-only
- `DATABASE_URL` where server-side database tooling uses it
- `NEXT_PUBLIC_REQUIRE_AUTH=true`
- `MINARVA_MODE=production`
- `NEXT_PUBLIC_MINARVA_MODE=production`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ENCRYPTION_KEY`
- `LICENSE_PRIVATE_KEY` — license-admin/server only
- `LICENSE_API_SECRET`
- `MINARVA_LICENSE_PUBLIC_KEY_HEX` — public key bundled into desktop at build time
- `VITE_LICENSE_API_URL` or `MINARVA_LICENSE_API_URL` — production HTTPS license API

Optional notification/email configuration: `RESEND_API_KEY`, `TRIAL_NOTIFICATION_FROM`.

Never expose service-role, secret, private-license, encryption, JWT or provider secrets in browser/public variables.

## Web deployment

The root `vercel.json` targets the Next.js app with:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @minarvabiz/web build
```

Expected output: `apps/web/.next`. Configure the production environment variables in the Vercel project before deployment.

---

## Architecture principles

1. Shared business logic — no duplicated profit/order math per app  
2. UUID keys + version fields for hybrid sync  
3. Soft deletes  
4. Financial tables → **manual** conflict resolution only  
5. Signed licenses + device fingerprint; private key never in client  
6. No secrets in source — environment configuration only  
7. Online + Offline + Hybrid from one core  

## License plans (defaults)

Trial · Basic · Professional · Business · Enterprise  

Limits cover users, devices, branches, products, customers.  
Multi-branch and API access are Enterprise features.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev:web` | Next.js dev server |
| `pnpm typecheck` | TypeScript across workspace |
| `pnpm build` | Turbo build |
| `pnpm --filter @minarvabiz/web build` | Production web build |
| `pnpm --filter @minarvabiz/desktop run package:win` | Windows installer |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Licensing](docs/LICENSING.md)
- [Production readiness](docs/PRODUCTION.md)
- [Desktop packaging](docs/DESKTOP.md)
- [Persistence](docs/PERSISTENCE.md)
- [Phases 18–50](docs/PHASES_18_50.md)
- [Release](docs/RELEASE.md)
- [Supabase setup](docs/SUPABASE.md)

---

## License

Proprietary — Evertek IT Solutions. All rights reserved.  
Not open source. Commercial distribution under signed license only.
