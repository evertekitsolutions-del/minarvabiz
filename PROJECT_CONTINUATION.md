# Minarva Biz — Continuation Checkpoint

## Mandatory rule for every `Continue`
1. Read this file first.
2. Inspect current `main` HEAD and the latest relevant commits/workflow runs.
3. Continue from **LAST COMPLETED STEP**, not from an older conversation summary.
4. Do not repeat already completed work unless verification shows regression.
5. Make the next concrete change/verification autonomously; do not ask for permission.
6. Never claim CI/build/runtime verification without evidence.
7. At the end of every work session, update this file with the exact last completed step, commit SHA, verification status, and the single next step.

## Product objective
Minarva Biz is being developed as a production-grade, offline-first Windows business/POS platform with the goal of being a best-in-class commercial product. Preserve all existing modules and functionality while adding higher-end capabilities incrementally.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`

## Architecture baseline
- Electron + React + TypeScript desktop
- SQLite offline-first persistence
- Web application + shared business logic/UI packages
- Commercial signed licensing: machine binding, online activation, offline validation/activation, trial/annual/perpetual plans, feature entitlements, deactivation/PC replacement, revocation, admin workflow

## Completed foundation / hardening (do not redo blindly)
- Platform boundary work
- Invoice numbering
- Cash-only drawer behavior
- Workflow dispatch / CI pipeline
- SQLite persistence serialization and awaitable persistence
- App save flow awaits persistence internally
- Legacy JSON renderer persistence API removed
- Legacy JSON main IPC removed
- CI guard against reintroducing `minarvabiz-db.json`, exact `db:read`, or exact `db:write`
- Renderer CSS/Tailwind build guard
- Windows installer packaging + artifact generation in CI
- License offline activation/import/signature verification work
- License deactivation failure handling
- Offline grace-after-expiry handling
- Trusted Electron IPC sender validation
- Bundled public-key verification on desktop

## Feature baseline already present
Dashboard, Customers, Products/Inventory, POS/Sales, Service Orders, Measurements, Order profit, Laundry & Ironing, Expenses, Purchases, Staff, CRM/notifications, Returns/Refunds, Reports, Day-end CSV, Product variants, Quotations, Cash register, A4/thermal printing, Global search, Users/roles/first-run admin, Backup/Restore, Settings, licensing/trial foundations.

## Higher-end feature work already added
- Business Intelligence dashboard insights
- Exception-first business intelligence panel
- Business Intelligence component export/integration
- Dashboard capability work is now the active product-improvement stream; do not roll these changes back.

## Last completed step
- Fixed the CI legacy-JSON guard so it allows legitimate SQLite IPC names such as `db:readBinary` and `db:writeBinary`.
- Commit: `4ee672bceb951f573c85709f71a22453d98d0cc1`.
- CI run #166 then exposed stale App.tsx UI prop/type mismatches; the repository was subsequently corrected and later dashboard BI work was added.
- Mandatory continuation checkpoint was added in commit `0365d7f82bd09daf5fdb58bb2b331f32b4efa32d`.

## Current HEAD / current verification
- Current main HEAD: `0365d7f82bd09daf5fdb58bb2b331f32b4efa32d`
- Commit: `docs: add mandatory continuation checkpoint`
- Checkpoint file: `PROJECT_CONTINUATION.md`.
- Current CI run #210: `34261685522` for this HEAD.
- Verified in run #210: Web ✅; Desktop legacy-JSON guard ✅; static production quality smoke ✅; business-logic typecheck ✅; UI typecheck ✅; desktop typecheck ✅; renderer build ✅; generated CSS inspection ✅; Electron build ✅.
- Windows package job is the remaining verification at this checkpoint; it is building the Windows installer and will run installed-runtime smoke/diagnostics before artifact upload.

## Current product direction
The repository has moved beyond foundation hardening into higher-end dashboard/business-intelligence capabilities. Continue that product roadmap from the repository state; do not restart old foundation tasks.

## Single next step
After CI run #210 completes, inspect the Windows installed-runtime smoke and diagnostics. Then continue from the latest Business Intelligence dashboard implementation with the next unfinished high-end capability already supported by the repository architecture.

## Release/runtime gate
- Fresh Windows `.exe` must be built from a current green HEAD.
- Windows installed-runtime smoke/diagnostics should be reviewed before release claims.
- Physical acceptance still includes install/launch, database persistence after restart, dashboard/sidebar visual integrity, offline licensing, and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
