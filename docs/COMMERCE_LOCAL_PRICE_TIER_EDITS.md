# SAL-014 — Safe editing of local B2B price-tier drafts

**2026-10-20 · Follow-up to PR #554 · Tracker #325**

The offline-only seller tier pricebook now supports changing an existing draft's quantity threshold and unit price in the Products → B2B quote preview modal, without deleting and recreating the draft.

- Domain `updateCommerceTierDraft(id, expectedVersion, patch)` enforces `products.manage` permission and exact optimistic revision, stable identity and creation timestamp, immutable branch/customer scope, and safe revision increments.
- Validates live catalog product is active and company-wide, current shop currency unchanged, exact-cent money / three-decimal quantities, wholesale price not higher than live retail, and no competing quantity threshold for that SKU/currency.
- All validation precedes changing the draft array. Invalid inputs and stale revisions leave the draft pricebook unchanged. True no-op updates do not increment revisions.
- Edit/Save/Cancel/Delete are explicitly **draft-only** operations; the UI displays revision numbers and clears old previews on changes. Draft editing is not checkout authorization.
- Updated versions round-trip through the full domain backup/restore; audit and existing local-save logic apply.

There are no new dependencies, production migrations, hosted changes, release installers, published tariffs, actual POS/invoice price changes, stock deductions or cloud sync. The pricebook is still a **device-local, unapproved, nonbinding preview**. Human review, verified customer/branch permissions, durable tenant-wide versioning and a ledger-safe publication authority are required before any billable integration.

Regressions: `packages/business-logic/src/__tests__/commerce-tier-draft-edit.test.mjs` (six test groups).
