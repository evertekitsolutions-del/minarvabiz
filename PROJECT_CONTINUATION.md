# Minarva Biz — Customer Delivery Checkpoint

## Mandatory rule for every `Continue`
1. Inspect the actual `main` HEAD and latest available CI/workflow evidence first.
2. Continue from the verified state; do not repeat completed work without a regression.
3. Make the next concrete fix/verification autonomously.
4. Never claim tests/build/runtime verification without evidence.
5. Keep this file aligned with the current delivery state and one clear next owner step.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`
- Product version: **1.0.4**
- This checkpoint documents the state immediately before this documentation commit; use the Git `main` ref for the exact current HEAD.

## Architecture baseline
- Online: Next.js + Supabase
- Offline Windows: Electron + SQLite primary persistence
- Hybrid: SQLite/outbox + Supabase synchronization foundation
- Commercial licensing: Ed25519 signed licenses, machine binding, activation/deactivation, offline activation package, plan-specific grace, and license-admin/server workflow

## Code-side customer-delivery hardening completed
- Phase 6 hydration and customer CRM functionality are restored.
- Desktop SQLite remains the primary offline business store; legacy JSON database IPC paths are guarded out of TypeScript production code.
- Packaged renderer is built with substantial CSS and relative asset paths; Windows CI previously installed and launched the packaged application successfully.
- Desktop persistence, backup and operations contract tests are present and passed on the verified baseline CI run.
- Web production guard rejects missing Supabase configuration outside development/demo modes; configured web client uses the public Supabase client key only.
- Financial sync conflicts remain manual instead of silently overwriting money-related data.
- Demo commercial license issuance/activation helpers were removed from the production-facing licensing package.
- Added owner CLI for real Ed25519 license issuance: `packages/licensing/scripts/issue-license.ts`.
- Added licensing smoke coverage for signature verification, wrong-key rejection, device binding and real token tamper rejection.
- Added CI guard that rejects demo licensing paths from production-facing TypeScript sources.
- Commercial release desktop builds can require an explicitly supplied public verification key with `MINARVA_COMMERCIAL_RELEASE=1`; the repository fallback key is refused in that mode.
- Fixed offline `.lic` activation to preserve the activation timestamp so plan grace can be evaluated after expiry.
- Added and then made exact the non-programmer `docs/CUSTOMER_DELIVERY_RUNBOOK.md`, including the full 15-file migration order and Windows/PowerShell owner commands.
- Windows build helper uses locked workspace dependencies and discovers `MinarvaBiz-Setup-*.exe` instead of a stale version-specific filename.
- Release metadata at repository root is `1.0.4`.

## Verified automated evidence
- Baseline CI run #514 (`35057162159`) on `e7b6824b075c8cf9081d34df953a4205f86baca1` passed web, license-admin, desktop and Windows-package jobs.
- Windows baseline artifact: `MinarvaBiz-Setup-1.0.4.exe`; installed-runtime smoke passed with valid SQLite database, preload bridge readiness and renderer mount.
- Desktop renderer baseline build produced 42.23 kB CSS and packaged relative asset paths.
- Web baseline production build generated 39 routes successfully.
- License-admin baseline typecheck, production security checks and production build passed.
- Licensing hardening changes were inspected in the actual `main` source tree, but a completed GitHub Actions run for the post-hardening HEAD is not exposed by the connected workflow-run endpoint; therefore those newest changes are not claimed as CI-passed.
- The connected GitHub status currently reports a **Vercel failure** for deployment `4PLi42fj9TpmU9BsazjhZZEBKSwu`; direct Vercel log access is blocked by the connected integration's authorization scope. This is not evidence of a desktop/licensing code failure.

## Customer delivery state
### GREEN — code-side
- Offline SQLite architecture and legacy JSON guard
- Desktop packaged boot/persistence foundation
- Backup/restore code and contract tests
- Core boutique/business modules present in repository
- Commercial Ed25519 signing/verification primitives
- Machine fingerprint binding
- Online activation/deactivation API path
- Offline `.lic` activation package verification
- Explicit invalid/wrong-device/expiry/revocation state handling
- Owner license issuance CLI
- Production demo-license path removed
- Production release-key guard
- Web Supabase production guard
- Financial conflict policy
- Full 15-file Supabase migration set present and ordered

### YELLOW — requires real owner/environment execution
- Owner supplies production Ed25519 keypair and builds the final customer installer with the matching public key.
- Owner deploys/operates license-admin with server-only secrets and live Supabase configuration.
- Owner applies all 15 repository migrations to the live Supabase project and verifies Auth/RLS/tenant isolation.
- Owner performs physical Windows UAT on the target customer PC, including visual theme, first-run, representative business flows, restart persistence, backup/restore and uninstall-data retention.
- Owner performs real online/offline license activation on at least one customer PC and tests deactivation/PC replacement.
- Real printer hardware output remains physical-only.
- Vercel deployment verification remains environment/integration scoped; the connected Vercel integration currently lacks authorization to inspect the reported deployment logs.

### RED — code-side blockers
- None identified in the inspected codebase.

## Exact owner checklist
1. Generate the production Ed25519 keypair on a secure machine:
   `pnpm --filter @minarvabiz/licensing generate-keys`
2. Set the public key and commercial release flag in the Windows build environment:
   `$env:MINARVA_LICENSE_PUBLIC_KEY_HEX="<owner-public-key>"`
   `$env:MINARVA_COMMERCIAL_RELEASE="1"`
3. Build the installer:
   `powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`
4. Keep `LICENSE_PRIVATE_KEY`, `LICENSE_API_SECRET`, and the Supabase server-only secret only in the license-admin/server secret store.
5. Apply these migrations in exactly this order:
   `001_core_schema.sql`
   `002_rls_policies.sql`
   `003_tenant_rls.sql`
   `004_quotations_and_extensions.sql`
   `005_product_variants.sql`
   `006_integrity_indexes.sql`
   `007_trial_registrations.sql`
   `20260901_license_lifecycle.sql`
   `20260901_trial_registrations.sql`
   `20260911_license_activation_atomicity.sql`
   `20260911_production_hardening.sql`
   `20260915_align_phase4_phase5_columns.sql`
   `20260915_operations_completion.sql`
   `20260915_operations_tenant_hardening.sql`
   `20260915_purchase_payment_method.sql`
6. Create/authenticate the owner/admin account and verify RLS/tenant isolation on live Supabase.
7. Issue the first paying-customer license through license-admin, or use the owner CLI documented in `docs/CUSTOMER_DELIVERY_RUNBOOK.md`. For offline activation, create the `.lic` package for the customer's exact 64-hex device fingerprint.
8. Install `MinarvaBiz-Setup-1.0.4.exe` on the target Windows PC and complete the UAT checklist.

## Single next step
**Owner execution only:** generate production keys, produce the final `1.0.4` installer with the owner public key, deploy/configure license-admin + live Supabase, issue one test customer license, and run the Windows UAT checklist. Any actual regression found there is the expected next code-change trigger.
