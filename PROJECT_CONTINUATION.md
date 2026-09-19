# Minarva Biz — Customer Delivery Checkpoint

## Mandatory rule for every `Continue`
1. Inspect the actual `main` HEAD and latest CI/workflow evidence first.
2. Continue from the verified state; do not repeat completed work without a regression.
3. Make the next concrete fix/verification autonomously.
4. Never claim tests/build/runtime verification without evidence.
5. Keep this file aligned with the current delivery state and one clear next owner step.

## Latest continuation audit — 2026-09-19
- PR #7 merged into main as `4d5f2a81156590486fa7375fa8f8d945aaa744f6`.
- Verified that exact code commit after merge:
  - [CI 35422776241](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35422776241) — PASS
  - [Licensing Smoke 35422776261](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35422776261) — PASS
  - [Windows Feature Click Smoke 35422776173](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35422776173) — PASS
  - [Windows Deep Installed Smoke 35422776302](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35422776302) — PASS
- Both Windows jobs installed on attempt 1 (exit 0), launched the installed app, and logged `WINDOWS_INTERACTION_AUDIT PASS`.
- Explicitly verified POS customer + creation/save, barcode empty -> added -> cleared cart state, sale completion, customer/product/category/order/payment/return/expense/supplier/purchase/staff/laundry/day-end/report/settings and automatic-backup interactions.
- The previous main installer access violation now has one bounded retry for that exact exit code plus hash/attempt diagnostics. These successful runs did not exercise retry; they do not prove the intermittent NSIS fault eliminated.
- Latest production-key installer: [minarvabiz-windows-installer-final](https://github.com/evertekitsolutions-del/minarvabiz/actions/runs/35422776302/artifacts/10578415750), artifact ID `10578415750`, contains `MinarvaBiz-Setup-1.0.4.exe`.
- Artifact ZIP digest: `sha256:d4ab0ccee55c1e46c264450c15915020c9a46e600bdd040519b096505ae7ae3a` (this is NOT the installer EXE hash).
- This checkpoint update changes documentation only; automated evidence above belongs to the exact code commit named above.
- Next owner step: use this main installer on the intended Windows PC for real commercial/offline license activation, restart/grace, printer output, and manual backup/restore UAT. Investigate any reported regression from that evidence; do not repeat already-passed automated fixes.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`
- Product version: **1.0.4**
- Latest audited code main before this documentation update: `4d5f2a81156590486fa7375fa8f8d945aaa744f6`

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
