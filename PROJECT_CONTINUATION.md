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
- Current HEAD at this checkpoint: `3462f30a2b1a716473994dc0dde271335876eda9`

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
- Commercial release desktop builds can now require an explicitly supplied public verification key by setting `MINARVA_COMMERCIAL_RELEASE=1`; repository fallback key is refused in that mode.
- Fixed offline `.lic` activation to preserve the activation timestamp so plan grace can be evaluated after expiry.
- Added `docs/CUSTOMER_DELIVERY_RUNBOOK.md` with installation, signing-key, activation, backup and customer UAT workflow.
- Windows build helper now uses locked workspace dependencies and discovers `MinarvaBiz-Setup-*.exe` instead of a stale version-specific filename.
- Release metadata at repository root is `1.0.4`.

## Verified automated evidence
- Baseline CI run #514 (`35057162159`) on `e7b6824b075c8cf9081d34df953a4205f86baca1` passed web, license-admin, desktop and Windows-package jobs.
- Windows baseline artifact: `MinarvaBiz-Setup-1.0.4.exe`; installed-runtime smoke passed with valid SQLite database, preload bridge readiness and renderer mount.
- Desktop renderer baseline build produced 42.23 kB CSS and packaged relative asset paths.
- Web baseline production build generated 39 routes successfully.
- License-admin baseline typecheck, production security checks and production build passed.
- Latest code changes after baseline add the licensing hardening and release-key guard described above. The normal push CI was triggered for those changes; this connector exposes the commit state but not a completed push-run result for the latest HEAD, so those newest changes are not claimed as CI-passed here.

## Customer delivery state
### GREEN — code-side
- Offline SQLite architecture and legacy JSON guard
- Desktop packaged boot/persistence foundation
- Backup/restore code and contract tests
- Core business modules already present in repository
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

### YELLOW — requires real owner/environment execution
- Owner supplies production Ed25519 keypair and builds the final customer installer with the matching public key.
- Owner deploys/operates the license-admin server with server-only secrets and live Supabase configuration.
- Owner applies all repository migrations to the live Supabase project and verifies Auth/RLS/tenant isolation.
- Owner performs physical Windows UAT on the target customer PC, including visual theme, first-run, representative sales/service flows, restart persistence, backup/restore and uninstall-data retention.
- Owner performs real online/offline license activation on at least one customer PC and tests deactivation/PC replacement.
- Printer hardware test remains physical-only and is not a code blocker.

### RED — code-side blockers
- None identified in the inspected codebase.

## Exact owner checklist
1. Generate the production Ed25519 keypair on a secure machine:
   `pnpm --filter @minarvabiz/licensing generate-keys`
2. Set only the public key for the commercial Windows build and mark it as a commercial release:
   `MINARVA_LICENSE_PUBLIC_KEY_HEX=<owner-public-key>`
   `MINARVA_COMMERCIAL_RELEASE=1`
3. Build the installer:
   `powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`
4. Keep `LICENSE_PRIVATE_KEY` only on the license-admin/server or secure owner machine. Deploy license-admin with its server-only secret configuration and live Supabase project.
5. Apply the repository migrations in increasing filename order from `supabase/migrations`, then create/authenticate the owner/admin account and verify RLS/tenant isolation on the live project.
6. Issue the first customer license with the owner CLI or, preferably for centrally managed customers, through the deployed license-admin panel. For offline activation, create the customer `.lic` package against that PC's 64-hex device fingerprint.
7. Install `MinarvaBiz-Setup-1.0.4.exe` on the target Windows PC and complete the customer UAT checklist in `docs/CUSTOMER_DELIVERY_RUNBOOK.md`.

## Single next step
**Owner execution only:** generate production keys, produce the final `1.0.4` installer with the owner public key, deploy/configure license-admin + live Supabase, issue one test customer license, and run the Windows UAT checklist. Any actual regression found there is the only expected next code-change trigger.
