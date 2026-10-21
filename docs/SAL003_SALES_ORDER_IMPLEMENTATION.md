# SAL-003 — Retail sales-order intent, first implementation slice

**Status:** PARTIAL source implementation, NOT accepted. Feature remains OFF.
Source branch: `feat/SAL-003-sales-order-domain-guards`.

The existing `orders.ts` and `orders-store.ts` implement tailoring/services; procurement has a separate PurchaseOrder. Neither substitutes for a retail sales order. This first coherent component introduces a **pure** domain planner that keeps order intent separate from invoice/payment/stock master authority.

- Inputs: verified organization/company/branch/warehouse scope, customer, ISO currency, exact milli-unit quantities and safe integer minor currency amounts.
- Model: UUID identity, unique create operation key, human sales-order number, lines, exact subtotal/discount/tax/total, draft/confirmed/cancelled/invoiced lifecycle, CAS version, optional linked invoice.
- Fail-closed: disabled by default; caller-supplied trusted role/scope must match; duplicate operation payload conflict, sales-order-number conflict, invalid money/quantity, stale version, forbidden transition and mismatched linked invoice reject without side effects.
- Zero changes to invoices, finance ledger, inventory, stock reservations, cloud outbox or customers on invocation. An explicitly opt-in SQLite pilot persists orders only when called; an additive PostgreSQL migration is included as unexecuted source with RLS and direct authenticated access revoked. No donor code imported: compared against Open Mercato sales module design and wrote original TypeScript; no new npm dependency or license.
- Direct positive and negative node tests included. These tests verify transition planning, **not** cloud commit, customer UAT or end-to-end workflows.

**Required follow-on before SAL-003 completion:** additive PostgreSQL and SQLite order/line tables with version-scoped compare-and-set, idempotent unique operation index, authoritative tenant/company/branch/warehouse RLS; a trust-bound server-side transactional create/confirm/cancel and confirmed-order invoice commit adapter (reusing the existing authoritative sale writer); shared web + desktop UI, existing product/role feature gating, snapshot backup/restore/export, sync envelopes/outbox/conflict review, negative integration tests, coverage >=80%, commercial acceptance and exact-head CI. Until then the exported planner has no UI call sites and cannot create customer-visible orders. No migration/release/production write is authorized.

## Persistence staging (not product activation)

- SQLite pilot: `sales-order-sqlite.ts` initializes a dedicated table only on explicit opt-in, checks stored org/company/branch/warehouse identity, commits one row or CAS update atomically, and refuses stale/unauthorized replay. Actual SQL.js tests exercise rollback and corruption refusal.
- PostgreSQL source: `supabase/migrations/20261021_sal003_sales_order_intents.sql` declares the matching versioned/order-number/idempotency-key record with branch/warehouse/customer tenant integrity trigger, enables FORCE RLS and revokes ALL direct public/anon/authenticated access. **Do not apply it to production or treat it as a complete cloud writer**. Approved server-side transactional RPC, testable grants and sync adapters still need to be implemented.
- In particular, `company_id` is an opaque UUID pending PLT-002 authority; **no direct client write, read or business acceptance** is permitted until company identity and permissions are implemented. No second customer or invoice owner is created.

## Invoice linkage hardening

- Offline schema and staged PostgreSQL schema reserve one unique (organization, invoice_id) binding. Even if two callers submit the same committed invoice concurrently, one link is rejected transactionally.
- The SQLite adapter requires a **host-owned verification callback** for any invoice-link transition, including retries; a renderer can never substitute an arbitrary sale description for a committed invoice proof. The callback must query the authoritative local sale record and confirm matching amount/party/scope before returning true. The current draft does not yet supply this callback or activate conversion.

## Draft correction (SAL-003)
`planSalesOrderDraftAmend` and `amendSalesOrderSqlite` support safe replacement of line quantities/prices/tax/discount, note and due date **only while draft**. Arithmetic is fully recalculated and persisted by one SQLite CAS. Wrong scope, stale versions, invalid quantities, altered idempotency-key payloads and confirmed-order edits fail closed. No issued sale or journal row is modified.

## Reference-authority boundary
The isolated SQLite create/amend adapters now fail closed without a trusted host callback that verifies real active customer, product and warehouse records in the **same** SQLite transaction. This is a mandatory dependency before future wiring, not a renderer-provided proof. Direct tests assert missing verifier, inactive/unknown customer and product, and rollback. The actual platform-specific resolver remains unimplemented and no shipping UI invokes the pilot.

## Sales order numbering (shared provider-neutral logic)
`suggestSalesOrderNumber` uses the same `SO-BIZ-2026-27-00001` financial-year/branch-neutral company-code format as invoices and quotations. It rejects cross-company/tenant lists, invalid trust context and invalid codes; archived orders retain their number. Numbering suggestions do **not** reserve a sequence; the authoritative SQLite/PG unique `(org, company, orderNumber)` index still catches concurrent conflicts. No new counter/service is introduced.

## Shared UI component (inactive scaffold)
`SalesOrderWorkspace` is a responsive, accessible controlled visual component for Web/Desktop. It includes a customer/product/quantity draft form, search and status filter, line totals, confirm/cancel callbacks and explicit note that stock/payments are untouched. It is exported from `@minarvabiz/ui` but **no shipping app mounts it**: `enabled` defaults to false and host callbacks must enforce real RBAC, branch and license authorization. Until company authority and real SQLite/Cloud writers are connected, this component is an integration scaffold, not an accepted feature.

## Scoped CSV export
The pure `exportSalesOrdersCsv` generates line-level CSV for authorized Sales Orders, preserving integer minor currency units and milli quantities and neutralizing spreadsheet formula payloads. Mixed-tenant/company/branch/warehouse selections fail closed. This is exported from the shared business package, but no shipping download flow is mounted until a trusted host supplies scoped rows and permissions.

## Multi-line sales-order draft composer
The shared UI now stages up to 100 independent product rows per draft, allows removing individual rows, and submits one complete intent rather than one product at a time. The staged-money estimate is explicitly non-authoritative; backend must resolve product versions, discounts/tax and customer/warehouse rights before accepting any draft. No app mounts or enables the component yet.
