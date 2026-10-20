# SAL-014 — Offline seller-only B2B tier draft pricebook

**Scope:** Incremental implementation inspired by Aimeos quantity prices and Open Mercato B2B price lists; implemented as original MIT-compatible Minarva TypeScript, without upstream runtimes or copied GPL/LGPL sources.

## Delivered

- Authorized operators with `products.manage` can create and delete **local-only** unscoped quantity-tier drafts on an active company-wide product in Products → B2B price quote preview.
- Exact-cent and exact 0.001 quantity input validation is inherited from the shared quote calculator. Drafts higher than current retail price and duplicate SKU/currency/threshold entries are rejected. Direct domain writes verify current product and role.
- Local tier drafts can be considered by the nonbinding quote preview. A one-off manually entered tier remains unsaved until the seller explicitly saves it.
- Drafts have immutable identities, revision-checked deletion, timestamp/audit events and draft-only markers.
- Every full domain backup/snapshot includes them; restore preflights the entire draft array before mutating live state. Legacy snapshots lacking drafts clear prior device-only records rather than contaminating the next business profile.
- Imported drafts reject injected branch/customer-group IDs, excessive count, duplicate IDs, conflicting thresholds, unsafe money/quantity, invalid currency or revision.
- No new dependency or hosted database migration.

## Deliberate limitations / release gate

The data is stored only in local snapshots and backups. A browser's local storage is **not automatically encrypted** by this module, and no cross-device synchronization is claimed. These local drafts are **not** tenant/customer-group authorized price lists, not published, not vouchers, and never consumed by POS, invoice, sales, checkout or cloud financial writers. Group-specific/branch-specific tariffs require verified group membership and branch grants. Merchant approval, pricebook version pinning, remote sync conflict resolution, commercial billing authority and storefront checkout remain future milestones.

`importDomainSnapshot` remains a multi-store best-effort rollback, not an ACID commit. Snapshot encryption is the responsibility of the enclosing storage/export facility.

## Evidence

- `packages/business-logic/src/commerce-tier-drafts.ts`
- `packages/business-logic/src/commerce-tier-quote-draft.ts`
- `packages/business-logic/src/persistence.ts`
- `apps/web/src/app/(app)/products/page.tsx`
- `packages/business-logic/src/__tests__/commerce-tier-draft-pricebook.test.mjs`

Tracker #325. No Windows release, production migration, deployment, optional paid AI or hosted dependency.
