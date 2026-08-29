# MINARVA BIZ

**Commercial Boutique Billing & Management Software**  
Online · Offline (Windows) · Hybrid

Built for real boutique, tailoring, and laundry shops.

---

## Editions

| Edition | Target | Database | Sync |
|---------|--------|----------|------|
| **Online** | Browser (Next.js 15) | Supabase PostgreSQL | — |
| **Offline** | Windows (Electron) | SQLite | — |
| **Hybrid** | Desktop + cloud | SQLite + Supabase | Outbox + conflicts |

---

## Modules (Phases 1–17)

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
| **Desktop pack** | File-JSON durable store, Electron IPC DB, electron-builder config |
| **Persistence bridge** | Domain snapshot export/import, AuthGate, Supabase skeleton |
| **Full hydrate** | All domain stores hydrate + auto localStorage bootstrap |
| **Ops polish** | Auto-save on mutations, receipt print, logout, optional auth |
| **Live ops** | Live dashboard metrics, shop profile, order receipts |
| **Collections** | Customer payments, day-end close, message templates |

---

## Repository layout

```
apps/
  web/                 Next.js App Router (Online UI)
  desktop/             Electron + React (Offline / Hybrid shell)
  license-admin/       License issuance panel
packages/
  ui/                  Shared components (AppShell, dashboard, modules)
  business-logic/      Pure domain + in-memory stores (swap to DB adapters)
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
# Fill Supabase + secrets (see .env.example)

pnpm dev:web            # http://localhost:3000
pnpm typecheck
pnpm --filter @minarvabiz/web build
```

Desktop shell lives in `apps/desktop`. Install Electron/Vite locally when packaging
for Windows (kept optional here to avoid heavy installs in CI/low-RAM environments).

---

## Architecture principles

1. Shared business logic — no duplicated profit/order math per app  
2. UUID keys + version fields for hybrid sync  
3. Soft deletes  
4. Financial tables → **manual** conflict resolution only  
5. Signed licenses + device fingerprint; private key never in client  
6. No secrets in source — environment configuration only  
7. Online + Offline + Hybrid from one core  

---

## License plans (defaults)

Trial · Basic · Professional · Business · Enterprise  

Limits cover users, devices, branches, products, customers.  
Multi-branch and API access are Enterprise features.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev:web` | Next.js dev server |
| `pnpm typecheck` | TypeScript across workspace |
| `pnpm build` | Turbo build |
| `pnpm --filter @minarvabiz/web build` | Production web build |

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Licensing](docs/LICENSING.md)
- [Production readiness](docs/PRODUCTION.md)
- [Desktop packaging](docs/DESKTOP.md)
- [Persistence](docs/PERSISTENCE.md)

---

## License

Proprietary — Evertek IT Solutions. All rights reserved.  
Not open source. Commercial distribution under signed license only.
