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
Minarva Biz is a production-grade, offline-first Windows business/POS platform targeting boutique, tailoring, bridal, uniform, bulk, T-shirt printing and related businesses. Preserve all existing functionality while adding best-in-class operations, intelligence, automation and commercial hardening.

## Repository
- `evertekitsolutions-del/minarvabiz`
- Branch: `main`

## Architecture baseline
- Electron + React + TypeScript desktop
- SQLite offline-first persistence
- Web application + shared business logic/UI packages
- Commercial signed licensing: machine binding, online activation, offline validation/activation, trial/annual/perpetual plans, feature entitlements, deactivation/PC replacement, revocation, admin workflow

## Core functionality already present
Dashboard, Customers, Products/Inventory, POS/Sales, Service Orders, Measurements, Order profit, Laundry/Ironing, Expenses, Purchases, Staff, CRM/notifications, Returns/Refunds, Reports, Day-end, Product variants, Quotations, Cash register, A4/thermal printing, Global search, Users/roles/first-run admin, Backup/Restore, Settings, licensing/trial foundations, SQLite offline persistence, sync foundation.

## Higher-end capability layers now added
- Business Intelligence dashboard insights and exception-first controls
- Customer Intelligence: deterministic RFM-style segmentation, LTV/value estimates, loyalty, churn risk and follow-up signals
- Production Intelligence: workload, delivery risk, unassigned/overdue detection and staff load
- Inventory Intelligence: velocity, days-of-cover, reorder points, recommended quantities, ABC classes, stock health, dead/slow/overstock detection
- Staff Productivity Intelligence: completion rate, on-time rate, workload score and capacity classification
- Production Workflow engine: received → cutting → stitching → optional embroidery/printing → finishing → ironing → QC → rework → packing → ready → delivered, with transition validation and event history
- Fabric/Material Intelligence: roll meters, reservations, batch/shade tracking, consumption and wastage calculations
- Business Intelligence engine: gross profit/margin, operating expenses, branch/product summaries and deterministic cash-flow projection
- Appointment engine: validation, staff conflict detection, duration and next-slot calculation
- Design Library engine: versioning, revisions, approval states and search
- Delivery Logistics engine: dispatch eligibility, delivery SLA/progress and status labels
- Business-mode templates for boutique, tailoring, bridal, uniform, bulk, T-shirt and laundry workflows
- Branch intelligence: branch performance comparison and stock-transfer recommendations
- Explainable Next-Best-Action engine as a safe deterministic layer beneath future AI assistant features

## Current UI integration
Desktop dashboard data calculates and returns Customer Intelligence, Inventory Intelligence and Staff Productivity signals. Dashboard UI surfaces production, customer, inventory and staff intelligence while preserving existing KPI, charts, order, stock and business-insight areas. Business Insights consumes the Next-Best-Action engine to show explainable operational priorities. Web dashboard data now also calculates and returns production-control and staff-productivity signals.

## Production persistence hardening completed
- `25a2653ae95bdbe54fd40addeb5be1e33610a2df8` — persist Phase 6 staff, assignments, incentives and notification mutations through the existing autosave/SQLite path; incentive payouts are also enqueued for sync.
- `592abd41d2bca58de4d7bd11a5e2413f006d1eb8` — persist branch creation and active-branch changes; branch creation also enters the sync outbox.
- `093751d379728acd4d0aee657f8319931c0e4d38` — persist Phase 7 return/refund, audit, backup metadata and backup verification mutations through the existing autosave/SQLite path.
- Duplicate experimental `advanced-ops-store.ts` was intentionally removed after repository inspection showed the existing `phase10-operations-store.ts` already provides persisted production-workflow and material-roll/consumption state.

## Web/Vercel hardening completed
- `b633e983dde3f8d455d4a703d34fe84ab433a134` — root `vercel.json` now explicitly targets the Next.js web build and `apps/web/.next` output.
- `8b00b63bfb6e532b66e3861330630b41a0a4d633` — added `apps/web/vercel.json` so the same repository also deploys correctly when the Vercel project uses `apps/web` as its Root Directory.
- Vercel reported **success** for commit `8a504e4ba63b81a1bfcb024cb668224bbf4df01c`; the earlier production deployment failure shown in the user's screenshot is no longer the active Vercel status.
- `1899b08ff5c1249885a54cddb10dffa4ad13a447` — wired web customer/product create/update mutations to the Supabase repository writer, preserving the repository's create contract for new customers.

## Current HEAD / verification
- Current main HEAD: `8a504e4ba63b81a1bfcb024cb668224bbf4df01c`.
- CI Run `34980141211` / #415 is associated with current HEAD and is still in progress at the latest observation.
- Vercel status for current HEAD is **success**.
- Earlier CI Run #398 for `d46f98f9be1bd5348eba4ab312a41e5d33516590` was fully successful, including Windows package creation, installed-runtime smoke and bridge/SQLite diagnostics.

## Release/runtime gate
A fresh Windows `.exe` may only be called release-ready after a current-HEAD CI run passes desktop/web/license-admin plus Windows packaging, installed-runtime smoke and bridge/SQLite diagnostics. Physical acceptance still includes install/launch, restart persistence, visual integrity, offline licensing and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
- Do not claim the full No.1/world-class roadmap is complete merely because an engine exists; complete UI, persistence, permissions, offline behavior, web behavior and tests before marking a capability complete.

## Last completed step
- Vercel deployment configuration hardened for both repository-root and `apps/web` project-root layouts.
- Web dashboard now surfaces production/staff intelligence.
- Web online mode now registers Supabase-backed customer and product upsert writers.
- Vercel reports success for current HEAD; CI #415 is still running, so no fresh Windows release claim is made.

## Single next step
Finish CI verification for HEAD `8a504e4ba63b81a1bfcb024cb668224bbf4df01c`; if green, continue closing the online persistence gap for payments/expenses and the user-facing Phase 10 production/material workflows, adding focused contract tests as each capability is wired; if any job fails, fix that blocker first and re-verify.
