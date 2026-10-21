# FIN-020 — Budget vs Actual Posted Ledger Preview

Date: 2026-10-21. Original Minarva Biz TypeScript, inspired by standard ERPNext Budget and Odoo analytic/budget variance reporting concepts. **No GPL/LGPL source or runtime dependencies copied.**

## Operator workflow

1. Open **Accounting & General Ledger → Budgets** in the shared Web/Windows interface.
2. Select an authorized income or expense account, the start/end calendar dates and a non-negative budget amount.
3. Click **Compare budget**. The preview reads the existing posted accounting journals and matches the chosen account and active branch.
4. View budget, actual amount, signed variance (actual minus budget), favourable/unfavourable result, utilization rate and number of journal entries.
5. Export a safe CSV for accountant review.

For expense accounts, actual = posted debits - credits and a lower actual is favourable. For income accounts, actual = credits - debits and a higher actual is favourable. The existing general ledger includes voided-original plus reversal journal entries; this preview follows that same convention (both balance to zero where both are within the date range). Never silently discard the original while counting the reversal. The report matches **transaction date**, not creation date or approval date. Foreign-branch entries are filtered and duplicate reportable journal IDs are rejected. Budget and journal amounts are parsed as bounded two-decimal integer minor units, with safe accumulation.

## Safety and remaining feature scope

This is **not a durable budget document**. No budget approval, distribution to cost centres, permission elevation, posting or accounting mutation. No database write/migration, background sync, paid service or production deployment. Compare one account at a time; dates and manual target are ephemeral in the UI. A negative actual amount may represent posted corrections/refunds.

Full FIN-020 remains: branch/company budget register, multiple accounts/cost centres, allocation by month, workflow approvals, audits, budget versioning, cap enforcement, currency rules, authoritative offline-first sync and customer acceptance.

## Verification

`node --test packages/business-logic/src/__tests__/account-budget-variance.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

Require exact-head GitHub CI, Web/Windows packaging and smoke, coverage/security before merge; no unilateral production release. Revert PR to roll back without data migration.
