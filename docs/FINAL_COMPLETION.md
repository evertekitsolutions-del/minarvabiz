# MINARVA BIZ — Completion report (development cycle)

## Product
Commercial Boutique Billing & Management Software  
Editions: Online (Next.js + Supabase) · Offline (Electron + SQLite/file-JSON) · Hybrid (sync outbox)

## Run
```bash
pnpm install
cp .env.example apps/web/.env.local   # fill Supabase if online
pnpm --filter @minarvabiz/web dev
# License admin
pnpm --filter @minarvabiz/license-admin dev
```

## Build
```bash
pnpm --filter @minarvabiz/web exec tsc --noEmit
pnpm --filter @minarvabiz/web build
node packages/business-logic/src/__tests__/profit.test.mjs
node packages/business-logic/src/__tests__/commercial.test.mjs
node scripts/smoke.mjs
```

## Windows installer (manual machine ≥4GB RAM)
See `docs/DESKTOP.md` and `apps/desktop/electron-builder.yml`.

## Supabase
See `docs/SUPABASE.md` — apply migrations 001 + 002, set env vars, create auth user.
