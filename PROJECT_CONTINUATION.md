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
- Global command palette with Ctrl/Cmd+K keyboard access, searchable module/action list, keyboard navigation and quick commands
- Dashboard capability work remains the active product-improvement stream; do not roll these changes back.

## Last completed step
- Verified CI run #215 (`34263828731`) on commit `6a6ec4f6ec82b58eb01b9432d6791d4943d576ab` end-to-end, including Web, Desktop, Windows installer packaging, installed-runtime smoke and runtime diagnostics.
- Windows installer artifact was successfully uploaded as artifact ID `10071077385`.
- Implemented the next P0 command-center capability after actionable BI: global command palette in commits `6fb0561ce81b7a76c6617ab4fe6a72b1ec2792d1`, `371522c211c38c1e6bf6d4bc00ad878e9dc7b7b7`, and `319dfcd713d8d6e5bd44e3bff86aa1034335b16c`.
- The palette is integrated at the shared `AppShell` level, so the Windows and web shells inherit it without removing existing module functionality. Source-level integration has been inspected; fresh CI for the new commits is pending.

## Current HEAD / current verification
- Current main HEAD: `319dfcd713d8d6e5bd44e3bff86aa1034335b16c`
- Latest completed product change: global command palette for module/action navigation.
- Last fully verified CI is run #215 for commit `6a6ec4f...`.
- The current HEAD contains the new command palette but does not yet have a surfaced CI run; do not treat it as release-candidate verified until the fresh CI completes.

## Current product direction
The repository has moved beyond foundation hardening into higher-end dashboard/business-intelligence and command-center capabilities. Continue that product roadmap from the repository state; do not restart old foundation tasks.

## Single next step
Inspect the fresh CI for current HEAD `319dfcd713d8d6e5bd44e3bff86aa1034335b16c`; if green, verify the command palette is included in the Windows installer/runtime path, then continue with the next unfinished high-end capability from the roadmap.

## Release/runtime gate
- Fresh Windows `.exe` must be built from a current green HEAD.
- Windows installed-runtime smoke/diagnostics should be reviewed before release claims.
- Physical acceptance still includes install/launch, database persistence after restart, dashboard/sidebar visual integrity, offline licensing, and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
