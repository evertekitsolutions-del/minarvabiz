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
- Expanded global search ranking and coverage for customers, sales/invoices, service orders, products, quotations, payments, and staff
- Dashboard capability work remains the active product-improvement stream; do not roll these changes back.

## Last completed step
- Corrected the CI legacy-JSON guard in commit `4ee672bceb951f573c85709f71a22453d98d0cc1` so legitimate SQLite `db:readBinary` / `db:writeBinary` IPC is not treated as legacy JSON persistence.
- Fresh CI run #220 (`34311592985`) completed successfully on commit `fe2deee9d8a6dda71a0d24f3e2e4d6f0852a419d`.
- Run #220 verified Desktop guard, production quality smoke, business-logic typecheck, UI typecheck, desktop typecheck, renderer build, generated CSS inspection, Electron build, Web typecheck/build, Windows packaging, installed-runtime smoke, runtime diagnostics, and Windows installer upload.
- Windows installer artifact for run #220: ID `10088610885`, size `99,984,349` bytes, SHA-256 `69fc8c5023426764a253b88d226e918f54c81261cd5690e47e69c71557e59749`, expires `2026-09-23T04:38:56Z`.
- Expanded global search implementation is in commit `fe2deee9d8a6dda71a0d24f3e2e4d6f0852a419d` and is included in the green Windows installer build.

## Current HEAD / current verification
- Current main HEAD: `fe2deee9d8a6dda71a0d24f3e2e4d6f0852a419d`
- Latest completed product change: expanded global search with relevance ranking across payments and staff in addition to the existing business entities.
- Fresh CI run #220 is fully green and produced a fresh Windows installer artifact.
- The repository also has CI-time installed-runtime smoke and diagnostics; physical user acceptance is still required before a final release claim.

## Current product direction
The repository has moved beyond foundation hardening into higher-end dashboard, business-intelligence, and command-center capabilities. Continue that product roadmap from the repository state; do not restart old foundation tasks.

## Single next step
Add the same high-quality global search experience to the Electron desktop shell (search results, keyboard-friendly navigation, and module routing) without duplicating or removing existing command-palette behavior; then run CI again and verify the new Windows installer/runtime path.

## Release/runtime gate
- Fresh Windows `.exe` must be built from a current green HEAD.
- Windows installed-runtime smoke/diagnostics should be reviewed before release claims.
- Physical acceptance still includes install/launch, database persistence after restart, dashboard/sidebar visual integrity, offline licensing, and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
