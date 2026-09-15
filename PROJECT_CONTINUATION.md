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
- `1899b08ff5c1249885a54cddb10dffa4ad13a447` — wired web customer/product create/update mutations to the Supabase repository writer, preserving the repository's create contract for new customers.
- `138f8829a22a1904e604dd31b3a6b528a9fe68c6` / `bf7b29877d9e08814cf3a1c2e77adc2f194d31ca` / `4ea0b13702097532607f3753fe7428b97b1ad9ac` — added remote writer contracts and Supabase mappings for payments, expenses, suppliers and laundry.
- `85b0da5bdbe11b7850986754360615705388a0b7` — Phase 5 expense/supplier/laundry creation now calls the registered remote writer while preserving local persistence/outbox behavior.
- `0e8241a1f3bfab4ad0f1e65c01763a18c4072e3c` — Web customer-payment collection explicitly persists the resulting payment and updated customer remotely.
- `15f7ea1b925b7d716ef8b60174f1c1fa08f04cb0` — Web expense creation explicitly persists the created expense remotely.

## Current verification status
- Current main HEAD: `15f7ea1b925b7d716ef8b60174f1c1fa08f04cb0`.
- The GitHub Actions run previously associated with the earlier UI commit was still pending at the last checkpoint; the latest commits need a fresh CI verification.
- A direct GitHub combined-status check on the earlier checkpoint HEAD exposed a `Vercel` failure context tied to the desktop Vercel project; the connected Vercel account currently exposes no team, so deployment logs could not be inspected from the connected Vercel tool.
- Existing historical CI evidence remains: Run #398 for `d46f98f9be1bd5348eba4ab312a41e5d33516590` fully succeeded, including Windows package creation, installed-runtime smoke and bridge/SQLite diagnostics.
- No fresh Windows `.exe` release claim is made from this session.

## Release/runtime gate
A fresh Windows `.exe` may only be called release-ready after a current-HEAD CI run passes desktop/web/license-admin plus Windows packaging, installed-runtime smoke and bridge/SQLite diagnostics. Physical acceptance still includes install/launch, restart persistence, visual integrity, offline licensing and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
- Do not claim the full No.1/world-class roadmap is complete merely because an engine exists; complete UI, persistence, permissions, offline behavior, web behavior and tests before marking a capability complete.

## Last completed step
Web online financial/laundry persistence was hardened: remote writer support was added for payments, expenses, suppliers and laundry; Phase 5 creation paths call the remote writer; payment collection and expense creation in the Web UI explicitly persist their resulting records remotely. Changes were committed through `15f7ea1b925b7d716ef8b60174f1c1fa08f04cb0`.

## Single next step
Run current-HEAD CI verification; if any job fails, fix that blocker first. If CI is green, complete Supabase online persistence for purchases and the remaining Phase 10 production/material user-facing workflows, then add focused contract tests for each new remote mutation path.
