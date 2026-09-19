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

- [x] Production Ed25519 signing key is server-side and matching public verification key is fetched for commercial Windows builds
- [x] Render license-admin is deployed with server-only secrets
- [x] Supabase production project and RLS are configured; security advisor reports no security findings
- [x] Commercial release build refuses missing/invalid/fallback public keys
- [x] Clean Windows install/launch, populated click smoke and trial activation pass in GitHub Actions
- [ ] Issue and activate one real commercial test license on the intended customer Windows PC
- [ ] Test offline .lic activation, grace, deactivation and PC replacement on the intended customer PC
- [ ] Run a manual backup + restore drill on the intended customer PC
- [ ] Create a real Supabase Auth user and verify online/hybrid tenant isolation with representative data
- [ ] Verify real printer hardware output where required
- [ ] Add Windows Authenticode code signing if SmartScreen/Unknown Publisher warnings are unacceptable

## Production security gates

- Do not ship with demo mode enabled.
- Do not ship predictable/default credentials.
- Apply all repository Supabase migrations in order on a fresh environment; do not manually replay migrations against the already-migrated production project.
- Every cloud business record must have a non-null `org_id`; legacy records must be explicitly backfilled before strict tenant RLS is enabled.
- Organization membership is provisioned by trusted admin/server tooling; end users cannot self-join an organization.
- The license private key and Supabase service-role key must remain outside Git and client bundles.
