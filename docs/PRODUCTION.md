# Production Readiness — MINARVA BIZ

## Editions

| Edition | Runtime | Data | Sync |
|---------|---------|------|------|
| Online | Next.js | Supabase Postgres | N/A |
| Offline | Electron Windows | SQLite | N/A |
| Hybrid | Electron + optional web | SQLite primary | Outbox → cloud |

## Security

1. **Licensing** — Ed25519 signed tokens; private key only on license-admin
2. **Electron** — `contextIsolation`, no `nodeIntegration`, sandboxed preload
3. **Secrets** — environment only; never hard-code
4. **Financial sync** — conflicts never auto-merged
5. **Audit log** — activation, returns, backups recorded

## Feature gates

Use `requireFeature(name)` and `assertLimit(resource)` from `@minarvabiz/business-logic`
before enabling gated modules (staff, multi-branch, cloud sync, advanced reports).

## Grace period

After expiry, core billing may continue for plan-specific grace days; advanced
features stay blocked until renewal.

## Backup policy

- Manual and automatic snapshots
- Never auto-delete the only remaining backup
- Verify integrity before restore

## Build commands

```bash
pnpm install
pnpm typecheck
pnpm --filter @minarvabiz/web build
# Desktop: install electron + vite locally, then package with electron-builder
```

## Go-live checklist

- [ ] Generate real Ed25519 keypair; store private key offline
- [ ] Configure Supabase project + RLS policies
- [ ] Rotate JWT / encryption / license API secrets
- [ ] Set `APP_EDITION` and feature flags per deployment
- [ ] Test offline grace path on a clean Windows machine
- [ ] Run backup + restore drill
- [ ] Confirm plan limits with a trial license

## Production security gates

- Do not ship with demo mode enabled.
- Do not ship predictable/default credentials.
- Apply Supabase migrations 001, 002, and 003 before enabling online/hybrid mode.
- Every cloud business record must have a non-null `org_id`; legacy records must be explicitly backfilled before strict tenant RLS is enabled.
- Organization membership is provisioned by trusted admin/server tooling; end users cannot self-join an organization.
- The license private key and Supabase service-role key must remain outside Git and client bundles.
