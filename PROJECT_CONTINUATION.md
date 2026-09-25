# Minarva Biz — Customer Delivery Checkpoint

## Mandatory rule for every `Continue`
1. Inspect the actual `main` HEAD and latest CI/workflow evidence first.
2. Continue from the verified state; do not repeat completed work without a regression.
3. Make the next concrete fix/verification autonomously.
4. Never claim tests/build/runtime verification without evidence.
5. Keep this file aligned with the current delivery state and one clear next owner step.

## Current release state — 2026-09-25
- Stable commercial release: **v1.0.5**
- GitHub release target: `89d0268e6e48ab0c8e1d18b261235ea613e46433`
- Release installer: `MinarvaBiz-Setup-1.0.5.exe`
- Installer SHA-256: `ab5eb534a5a0c0a5098923f05ef68e407316975a54a75e83262d49a0b73c241b`
- Production signed update-channel verification is present on current main `21bc53c18b86c99aed2abd3c390380f8d56587ee` (PR #136).
- v1.0.4 references below are retained only where they document historical audit evidence; they are not the current customer-delivery version.
- Next owner step: physical/customer-PC UAT must use **v1.0.5**.

## Historical continuation audit — 2026-09-23
- PR #81 merged into main as `1de0f3b198ff369efc06c530efc5afa8eef81835`.
- Verified that exact merged-main code baseline with main-push workflows:
  - [CI 35886528870](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35886528870) — PASS (#864)
  - [Licensing Smoke 35886528896](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35886528896) — PASS (#331)
  - [Windows Feature Click Smoke 35886528903](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35886528903) — PASS (#256)
  - [Windows Deep Installed Smoke 35886528950](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35886528950) — PASS (#264)
- Final production-key Windows artifact from Deep Smoke #264:
  - `minarvabiz-windows-installer-final`
  - artifact ID `10763560386`
  - archive digest `sha256:7d6c574c7da064ab0fcc3d4b78602527b77329224b8415dda01618fcc37e8654`
  - retention expiry: 2026-10-23 16:11:44 UTC
- GitHub Vercel commit status for the frozen baseline is PASS.
- PR #81 closes the last known planned code milestone: product opening stock now posts through accounting with validation/permission/preflight/rollback coverage.
- Final release freeze is now the active milestone. No feature hunting or speculative additions are planned.
- PRs #15/#17/#22 remain stale/superseded and must not be merged.
- This freeze/documentation update must not alter runtime behavior. The frozen code baseline remains `1de0f3b198ff369efc06c530efc5afa8eef81835`.
- Next owner step after freeze evidence is merged: physical/production UAT on the intended Windows PC. Only a reproducible UAT blocker should reopen code work.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`
- Product version: **1.0.5**
- Current main at v1.0.5 release-channel verification: `21bc53c18b86c99aed2abd3c390380f8d56587ee`

## Current architecture
- Online: Next.js + authenticated Supabase/PostgREST
- Offline Windows: Electron + SQLite primary persistence
- Hybrid: SQLite/outbox + Supabase synchronization foundation
- Licensing: Render-hosted license-admin + Supabase + Ed25519 signed licenses, machine binding, activation/deactivation, offline `.lic` packages and grace handling

## Completed release-blocker fixes
- Desktop commercial license state now overrides the trial gate correctly.
- Paid license activation is available before or after a trial.
- Desktop activation/validation/deactivation uses the Render `/api/license/*` endpoints.
- Render cold-start tolerance was added for first activation.
- Desktop navigation and domain permissions now enforce licensed plan features.
- License-admin hosts trial registration plus activation/validation/deactivation APIs.
- Web Supabase hydration/writes now use the signed-in access token for RLS-protected operations.
- Customer/product IDs are preserved across online writes.
- Product categories are hydrated/persisted and can be created online.
- Previously missing web routes no longer produce 404s.
- Desktop callbacks/modules previously found missing are wired and smoke-tested.

## Historical automated evidence (superseded by latest audit above)
Latest verified runs on main commit `4c8599db659dfa6798697ee530536072c23af8f9`:

- CI `35380365555` — PASS
- Licensing Smoke `35380365569` — PASS
- Windows Feature Click Smoke `35380365428` — PASS
- Windows Deep Installed Smoke `35380365482` — PASS

Final installer artifact from the deep Windows run:
- `MinarvaBiz-Setup-1.0.4.exe`
- SHA-256: `40ae5ee6546e3c9d6ad5a419127fdf961fecbf86027bb482b720a60dfb2f297b`
- Artifact ID: `10561709928`

## Historical live environment state (not rechecked in this continuation)
- Render license-admin is configured with server-side license/Supabase secrets.
- License-admin health previously returned signing key = ok and database = ok.
- Supabase project is active/healthy.
- Supabase security advisor currently reports **0 security findings**.
- Supabase currently has 0 Auth users, 0 commercial licenses, 0 license activations, and 1 trial registration.
- Performance advisor warnings are currently informational/redundant-policy or unused-index findings; they are not release blockers.
- A repository tenant-policy alignment migration now captures the hardened production RLS/default behavior for reproducible fresh deployments.
- Vercel investigation remains deferred and must not trigger destructive project changes.

## Customer delivery state

### GREEN — verified code/build
- SQLite production persistence
- Installer build/install/launch
- Trial activation
- Commercial license code path and production-key gate
- Backup/restore implementation and persistence tests
- Customer/product/order/POS/payment/stock business logic
- Day-end, returns, suppliers, staff details, audit, global search, notifications, reports
- Render license-admin build/security checks
- Supabase schema + RLS security lint
- Online authenticated Supabase code path compiles/builds
- No private signing key bundled into desktop

### YELLOW — physical/real-environment UAT still required
- Real commercial license issuance + activation on the actual customer PC
- Offline `.lic` activation and restart/grace behavior on the actual PC
- Deactivation / PC replacement workflow
- Manual backup + restore drill on the actual customer PC
- Real printer/thermal printer output
- Online/hybrid Auth + tenant isolation with a real Supabase user and representative data
- Windows code signing certificate (unsigned installer may trigger SmartScreen/Unknown Publisher)

### RED — code-side blockers
- None identified after the latest automated release audit.

## Historical next owner step (superseded by the latest continuation audit)
Install the verified `MinarvaBiz-Setup-1.0.4.exe` on the intended customer/test Windows PC, issue one temporary commercial test license from license-admin, and complete the physical UAT checklist. Any regression found there becomes the next code fix.
