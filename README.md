# MINARVA BIZ

**Commercial Boutique Billing & Management Software**

Online · Offline (Windows) · Hybrid

## Overview

Production-grade boutique / tailoring / laundry management system for commercial use.

| Edition | Target | Database |
|---------|--------|----------|
| **Online** | Browser (Next.js) | Supabase PostgreSQL |
| **Offline** | Windows (Electron) | SQLite |
| **Hybrid** | Desktop + cloud | SQLite + Supabase sync |

## Structure

```
apps/
  web/                 Next.js (Online + Hybrid UI)
  desktop/             Electron + React (Offline + Hybrid)
  license-admin/       License administration panel
packages/
  ui/                  Shared React components & theme
  database/            Drizzle schemas (Postgres + SQLite)
  business-logic/      Pure domain services
  billing/             Invoice, payment, tax engines
  licensing/           Signed license keys, activation, fingerprint
  sync/                Outbox, queue, conflict resolution
  validation/          Zod schemas
  types/               Shared TypeScript types
  utils/               IDs, crypto, dates, currency helpers
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

## Getting Started

```bash
pnpm install
cp .env.example .env
# Edit .env

pnpm dev:web              # http://localhost:3000
pnpm dev:desktop
pnpm dev:license-admin    # http://localhost:3001
```

## Architecture Principles

1. Shared core business logic in `packages/business-logic`
2. UUID primary keys for Online ↔ Offline sync
3. Soft deletes + versioning for safe hybrid sync
4. Ed25519 signed licenses + machine fingerprint
5. No secrets in code — environment variables only
6. Desktop-first professional UI

See `docs/` for Architecture, Database, and Licensing details.

## License

Proprietary. Copyright © Evertek IT Solutions. All rights reserved.
UNLICENSED — commercial product.
