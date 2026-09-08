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
- Windows installed-runtime smoke + SQLite database existence/validity smoke
- Windows runtime diagnostics capture
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
- Actionable Business Intelligence insight controls that can route users directly to relevant modules
- Dashboard capability work remains the active product-improvement stream; do not roll these changes back.

## Last completed step
- Verified CI run #210 (`34261685522`) on commit `0365d7f82bd09daf5fdb58bb2b331f32b4efa32d` end-to-end, including Windows installer generation and installed-runtime smoke/diagnostics.
- Windows runtime smoke confirmed the installed Minarva Biz process stayed alive and created a valid SQLite database at `C:\Users\runneradmin\AppData\Roaming\@minarvabiz\desktop\minarvabiz.db`.
- Installer artifact was successfully uploaded (artifact ID `10070259365`).
- After that verified checkpoint, actionable BI UI was implemented in commits `72cf0b4db0e94347f13c1bfa99c94179d7f0d3ce` and `22456b1a2d5dee9f4eab4bb687edc565cc775962`; these new commits are not yet CI-verified.

## Current HEAD / current verification
- Current main HEAD: `22456b1a2d5dee9f4eab4bb687edc565cc775962`
- Latest changes: Dashboard BI insights now expose actions; desktop wires those actions to relevant modules.
- The last fully verified CI remains run #210 for the previous HEAD `0365d7f...`.
- The latest HEAD still requires fresh CI verification before it can be treated as a release candidate.

## Current product direction
The repository has moved beyond foundation hardening into higher-end dashboard/business-intelligence capabilities. Continue that product roadmap from the repository state; do not restart old foundation tasks.

## Single next step
Run/inspect the fresh CI for current HEAD `22456b1a2d5dee9f4eab4bb687edc565cc775962`; if green, verify the new actionable BI behavior is included in the Windows installer/runtime path, then continue with the next unfinished high-end dashboard capability.

## Release/runtime gate
- Fresh Windows `.exe` must be built from a current green HEAD.
- Windows installed-runtime smoke/diagnostics should be reviewed before release claims.
- Physical acceptance still includes install/launch, database persistence after restart, dashboard/sidebar visual integrity, offline licensing, and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
