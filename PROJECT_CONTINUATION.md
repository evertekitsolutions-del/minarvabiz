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

## Last verified CI baseline
- Run #157: `34018988733`
- Result: success
- Included successful Web/Desktop/Renderer/Electron/Windows packaging and `.exe` artifact verification.
- This run predates some later commits, so it must not be treated as proof for later HEADs.

## Latest known work immediately before this checkpoint
- CI legacy JSON guard was fixed so SQLite `db:readBinary` / `db:writeBinary` are allowed.
- Latest intended commit: `4ee672bceb951f573c85709f71a22453d98d0cc1`
- Message: `ci: fix legacy JSON guard to allow SQLite IPC`
- Fresh workflow verification was still pending at the time this checkpoint was created.

## Current workstream
**Priority:** establish a reliable continuation loop, then resume the higher-end/world-class feature roadmap from the exact repository state.

## Next step
1. Verify current `main` HEAD and the workflow run/artifact for the guard-fix commit.
2. If CI is green, continue with the next unfinished world-class product capability already represented in repository roadmap/issues/commits; inspect repository state before selecting it.
3. After each concrete change, update this checkpoint.

## Release/runtime gate still requiring physical Windows validation
- Install fresh Windows `.exe`
- Launch without DB/SQLite/asset errors
- Verify dashboard/sidebar visual integrity
- Create customer/product/sale
- Restart and confirm persistence in `%APPDATA%\\Minarva Biz\\minarvabiz.db`
- Verify offline license activation/validation
- Verify backup/restore

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
