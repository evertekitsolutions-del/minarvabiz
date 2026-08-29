# Release readiness (v1.0.0-rc)

## Checklist
1. `pnpm install`
2. `pnpm --filter @minarvabiz/web exec tsc --noEmit`
3. `pnpm --filter @minarvabiz/web build`
4. `node scripts/smoke.mjs`
5. Configure `.env` from `.env.example` (no secrets in repo)
6. Generate license keys: `packages/licensing/scripts/generate-keys.ts`
7. Desktop: see `docs/DESKTOP.md` (electron-builder on ≥4GB machine)

## Version
Package versions remain `0.1.0` in workspace until commercial cut; product label `1.0.0-rc` in system health.
