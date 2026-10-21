# INV-005 — Windows Offline counted batch lots + FEFO worksheet

**22 October 2026 | Option A implementation cut**

## Delivered source

Minarva Biz's existing batch-expiry register and existing FEFO implementation are reused rather than rewritten. New `local-lot-counts.ts` records **physical counted quantity per registered batch and WMS bin**, active/blocked selection and optimistic revisions. Its typed API supports add/edit/delete, date-scoped FEFO proposals, export, import, and isolated branch-scoped lists.

- Warehouse → **Batch physical counts & FEFO worksheet** in the common React UI for installed Windows.
- Operator selects a previously registered batch reminder and a physical WMS bin with already-allocated product stock, then saves a count (up to 0.001 units) and optionally marks it blocked.
- The **sum of locally counted batches cannot exceed the current existing WMS physical on-hand for the same product/bin**. Current WMS quantities are rechecked on edits and before FEFO suggestions.
- FEFO picks invoke the already-tested `planFefoLotAllocations` (existing Minarva implementation), excluding blocked/expired lots and choosing nearest expiry first. Insufficient selected lot stock fails closed.
- The record stores branch, reference, WMS product/warehouse/location identity, counted milli-units, status, version and timestamps.
- Local Windows SQLite domain snapshots and backups include an optional `localLotCounts` collection with full structural validation and all-or-nothing hydrate. Legacy backups omit the collection and safely load an empty register.
- Every edit checks `inventory.adjust` permission, the active branch, identity, and expected revision. Read and FEFO require `reports.view`. Edits are blocked in production browser sessions without desktop SQLite runtime.
- Audit events and `touchPersistence` occur after a validated mutation.

## OSS and architecture

Option A reuses the upstream **MIT Open Mercato Core expiry helper** already vendored and attributed by INV-006; it is not duplicated here. The first-party FEFO planner was already present and is reused. No GPL/LGPL source is copied. No new dependency, paid service, data migration or production release.

## Important non-completion and safety limits

This adds *physical count metadata*, not a live authoritative stock lot balance. It **does not**:
- sell, reserve, decrement or automatically prevent a checkout;
- update product/WMS stock, GRN, purchase or accounting posting;
- move or receive stock between locations;
- synchronize lots with another device, tenant or cloud service;
- prove actual batch quantity is still present after another sale or stock movement.

Before a sellable controlled lot system, implement atomically with authorized SQLite/Postgres writers: lot receipt attribution to purchase/GRN, warehouse stock version/quantity checks, lot-reservation-to-sale settlement, return/reversal and per-device offline conflict reconciliation. Authoritative company/tenant identity must be obtained from trusted desktop enrollment or authenticated server, not a renderer field.

## Verification

`node --test packages/business-logic/src/__tests__/local-lot-counts.test.mjs`

Exact-head CI must pass web/desktop typechecks, the full domain test suite, business browser workflow, Windows packaging and deep installed-smoke, coverage, licensing, dependency-security checks **before** merging.

No change in Master Vision % is claimed. Customer delivery requires independent installed Windows pilot acceptance.
