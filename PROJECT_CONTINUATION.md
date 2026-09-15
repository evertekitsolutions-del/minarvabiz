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
Desktop dashboard data now calculates and returns Customer Intelligence, Inventory Intelligence and Staff Productivity signals. Dashboard UI was updated to surface these sections while preserving the existing KPI, charts, order, stock and business-insight areas.

## Current HEAD / verification
- Current main HEAD: `8288829127b1ae66ff2a88179dd2ded3ca8cb357`
- Latest code change: `fix(design): correct revision snapshot typing`.
- The earlier CI run `34939434493` failed at desktop typecheck because inventory dashboard mapping referenced `InventoryIntelligenceResult.stockQuantity`; this was corrected in commit `482f8a0911d668eb24c06a6f30f868840f5a22b2`.
- A new CI run for the corrected desktop integration was observed at run `34939514306`; desktop, web and license-admin subsequently passed while Windows runtime smoke was still running when last observed.
- Newer feature commits after that verification added Business Intelligence, appointments, design, delivery, business modes, branch intelligence and next-best-action engines plus exports.
- CI run `34939837568` for HEAD `828882...` was in progress at last observation. It must finish before any release/build claim is made.

## Release/runtime gate
A fresh Windows `.exe` may only be called release-ready after a current-HEAD CI run passes desktop/web/license-admin plus Windows packaging, installed-runtime smoke and bridge/SQLite diagnostics. Physical acceptance still includes install/launch, restart persistence, visual integrity, offline licensing and backup/restore.

## Important constraints
- Do not remove existing features/modules to make room for new ones.
- Do not replace SQLite with localStorage or legacy JSON as primary business persistence.
- Do not place a license private key in the client.
- Prefer small, verifiable commits over broad rewrites.
- Do not claim the full No.1/world-class roadmap is complete merely because an engine exists; complete UI, persistence, permissions, offline behavior, web behavior and tests before marking a capability complete.

## Last completed step
- Corrected the inventory dashboard type error in commit `482f8a0911d668eb24c06a6f30f868840f5a22b2`.
- Added and exported production workflow, fabric/material intelligence, BI, appointments, design library, delivery logistics, business modes, branch intelligence and explainable next-best-action engines through commits leading to `8288829127b1ae66ff2a88179dd2ded3ca8cb357`.
- Integrated customer/inventory/staff intelligence into the desktop dashboard UI/data path.

## Single next step
Finish CI verification for HEAD `8288829127b1ae66ff2a88179dd2ded3ca8cb357`; fix any newly reported errors, then move the new production/material/design/appointment/delivery engines from domain-only implementation into persisted store + user-facing module workflows without regressing existing functionality.
