# SAL-003 — Retail sales-order intent, first implementation slice

**Status:** PARTIAL source implementation, NOT accepted. Feature remains OFF.
Source branch: `feat/SAL-003-sales-order-domain-guards`.

The existing `orders.ts` and `orders-store.ts` implement tailoring/services; procurement has a separate PurchaseOrder. Neither substitutes for a retail sales order. This first coherent component introduces a **pure** domain planner that keeps order intent separate from invoice/payment/stock master authority.

- Inputs: verified organization/company/branch/warehouse scope, customer, ISO currency, exact milli-unit quantities and safe integer minor currency amounts.
- Model: UUID identity, unique create operation key, human sales-order number, lines, exact subtotal/discount/tax/total, draft/confirmed/cancelled/invoiced lifecycle, CAS version, optional linked invoice.
- Fail-closed: disabled by default; caller-supplied trusted role/scope must match; duplicate operation payload conflict, sales-order-number conflict, invalid money/quantity, stale version, forbidden transition and mismatched linked invoice reject without side effects.
- Zero changes to invoices, finance ledger, inventory, stock reservations, PostgreSQL, SQLite, cloud outbox or customers on invocation. No donor code imported: compared against Open Mercato sales module design and wrote original TypeScript; no new npm dependency or license.
- Direct positive and negative node tests included. These tests verify transition planning, **not** cloud commit, customer UAT or end-to-end workflows.

**Required follow-on before SAL-003 completion:** additive PostgreSQL and SQLite order/line tables with version-scoped compare-and-set, idempotent unique operation index, authoritative tenant/company/branch/warehouse RLS; a trust-bound server-side transactional create/confirm/cancel and confirmed-order invoice commit adapter (reusing the existing authoritative sale writer); shared web + desktop UI, existing product/role feature gating, snapshot backup/restore/export, sync envelopes/outbox/conflict review, negative integration tests, coverage >=80%, commercial acceptance and exact-head CI. Until then the exported planner has no UI call sites and cannot create customer-visible orders. No migration/release/production write is authorized.
