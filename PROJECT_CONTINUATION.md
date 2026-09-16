# Minarva Biz — Continuation Checkpoint

## Mandatory rule for every `Continue`
1. Inspect the current `main` HEAD and latest CI/workflow runs first.
2. Continue from the actual last completed step; do not repeat completed work without a regression.
3. Make the next concrete verification/fix autonomously.
4. Never claim tests/build/runtime verification without evidence.
5. Keep this checkpoint updated with the latest verified parent commit, verification status and one next step.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`
- Product: **Minarva Biz 1.0.4**

## Architecture baseline
- Online: Next.js + Supabase
- Offline Windows: Electron + SQLite primary persistence
- Hybrid: SQLite/outbox + Supabase synchronization foundation
- Commercial signed licensing: machine binding, online activation, offline validation/grace, plan/features, deactivation/revocation and license-admin workflow

## Feature baseline
Dashboard, POS/Sales, Payments, Products, Inventory, Variants, Customers, Measurements, Tailoring/Service Orders, Production Workflow, Laundry/Ironing, Purchases, Expenses, Suppliers, Staff/Assignments/Incentives, CRM, Quotations, Cash Register, Returns/Refunds, Delivery, Loyalty, Reports, Day-end, Notifications, Backup/Restore, Users/Roles, Auth foundations, Licensing/Trial, Sync/Outbox and printing foundations remain in the repository.

## Code-side finalization completed
- Phase 6 hydration and customer CRM APIs restored at `e7b6824b075c8cf9081d34df953a4205f86baca1`.
- CI run #514 (`35057162159`) on that baseline passed all four jobs: web, license-admin, desktop and Windows-package.
- Windows CI produced `MinarvaBiz-Setup-1.0.4.exe`, installed it and passed runtime smoke: valid SQLite database, preload bridge readiness and renderer mount.
- Desktop renderer build produced 42.23 kB CSS and generated relative `./assets/*.css` paths; Electron packaging uses `asar: true` and includes `dist/**/*`.
- CI legacy-persistence guard passed: no TypeScript references to legacy `minarvabiz-db.json` or `db:read`/`db:write` APIs.
- SQLite persistence/backup/operations contract tests passed.
- Web production build generated 39 routes successfully.
- License-admin typecheck, security configuration checks and build passed.
- No `TODO`/`FIXME` search hits were found during final audit.
- Windows build helper was corrected to use locked workspace dependencies and discover `MinarvaBiz-Setup-*.exe` instead of a stale hard-coded `1.0.0` filename.
- `README.md`, `docs/RELEASE.md` and `.env.example` were updated for the 1.0.4 release and owner workflow.

## Current release artifact evidence
- CI artifact: `minarvabiz-windows-installer`
- Artifact ID: `10431675300`
- SHA-256: `0cea4b9409a70735389722de9662062ecda9b3664df33f539e8d0a59645a1a64`
- Expires: 2026-09-30

## What remains external
These are intentionally not marked complete by repository CI:
- Owner's physical Windows UAT and visual dashboard/theme acceptance
- Real customer-machine restart/persistence check
- Real license activation/offline grace with production keys
- Live Supabase migration application, RLS/tenant validation and offline→online sync verification
- Production Ed25519 key generation and secret placement
- Optional Vercel deployment verification; current connected Vercel integration lacks authorization to the `minarva-biz` team scope
- Real thermal/A4 printer hardware validation

## Last completed code commit before this checkpoint
`6f8663dae2fa31ca7d13880a0fc5edc9af5f9062` — commercial version metadata alignment at the repository root.

## Checkpoint note
This file is committed as the final handoff checkpoint. Its parent SHA above identifies the exact code/documentation state immediately before the checkpoint commit itself. The actual current `main` HEAD is the commit containing this file; record that exact SHA from Git history after commit creation.

## Single next step
**Owner Windows UAT only:** install `MinarvaBiz-Setup-1.0.4.exe` on the target Windows PC and execute the acceptance checklist for visual theme, first-run trial/license, customer/product/sale/payment flow, stock deduction, tailoring/measurement/order expense/profit, laundry, backup/restore, close/reopen persistence, uninstall AppData preservation and real printer output. Any regression found there is the only next code-change trigger.
