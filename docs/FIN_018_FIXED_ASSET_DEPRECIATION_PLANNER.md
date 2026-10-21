# FIN-018 — Fixed Asset Straight-Line Depreciation Planner (first slice)

Date: 2026-10-21. Product: Minarva Biz Web + Windows shared Accounting UI.

## Inspiration and licensing

Conceptual workflow inspired by ERPNext Assets, Odoo Accounting Assets and Dolibarr bookkeeping. All implementation is **original TypeScript**. No GPL/LGPL source code, artwork, licensed addon, cloud service or paid AI dependency was copied or installed.

## Customer-visible operator journey

In **Accounting & General Ledger → Fixed Assets**, enter asset reference, asset name, depreciation start date, acquisition cost, residual value and useful life in whole months (1–360). Click **Preview depreciation** to generate a straight-line **monthly book depreciation schedule** and **Export depreciation CSV** for accountant review.

The convention is a **full monthly charge at the last calendar day of the start month**, including the start month, with no partial-month proration. Acquisition and residual values are restricted to exact two-decimal safe-integer cents. Depreciable base is acquisition minus residual; whole cents are evenly divided, with remainder pennies added to the earliest months, so total depreciation exactly reconciles to the residual value. Date arithmetic uses UTC only to model local business **calendar** dates, not timestamps, preserving leap day/month-end determinism. CSV uses UTF-8 with formula-prefix escape and quoted cells.

## Scope and safeguards

This is a **nonposting schedule preview**, not a fixed asset book or tax depreciation engine.

- No registered asset, store/tenant database write, GL journal, accounting adjustment, tax depreciation assertion, depreciation posting, reminder or vendor communication
- No automatic depreciation expense, approval policy, inventory mutation or expense allocation
- No new database migration, paid infrastructure, production deploy or Windows installer release

## Full FIN-018 follow-up acceptance

Durable branch-authorized fixed asset register (classes, acquisition history, ownership, serial no.), posting journals to the correct accounts only after user approval, disposal/write-off, impairment, partial periods and tax/country rules, book-method elections, depreciation revisions and reconciliation, audit/authorization, multi-branch reporting and Offline/Hybrid replay/duplicate prevention remain required. This milestone must not be marked as full FIN-018 completion without these acceptance gates.

## Verification gates

`node --test packages/business-logic/src/__tests__/fixed-asset-depreciation.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

Review GitHub exact-head CI, Windows packaged smoke and security + coverage before merge. Rollback: revert PR; no data migrations. Do not increase the entire Master Vision percentage based on this partial slice.
