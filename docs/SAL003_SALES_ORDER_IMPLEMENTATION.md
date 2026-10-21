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

## Idempotent create retries after draft updates
The canonical original create request is stored immutably alongside mutable draft lines and notes. Repeating the original operation key and unchanged original request returns the current order even after draft amendments. Changed original input with the same key is rejected. This is original Minarva TypeScript, not a cryptographic signature.

## Confirmation must recheck trusted references
A sales order can become stale between draft creation and confirmation. The isolated SQLite confirmation path now requires the same trusted live customer/product/warehouse verifier, including on identical retries; a missing or negative response leaves order state unchanged. Cancellation and post-commit invoice linkage keep their separate authorization rules. This does not activate customer checkout.

## Durable offline event staging (not cloud sync)
The isolated SQLite pilot now creates an append-only `retail_sales_order_pending_events_v1` row in the SAME transaction as every successful create/amend/confirm/cancel/invoice-link operation. No event is added on idempotent retries; a failed event insert rolls back the business-order mutation. Event records keep tenant/company/branch/warehouse, operation and revision identity, and a bounded immutable order snapshot. The read-only list is tenant scoped and rejects corrupted payloads. There is deliberately NO network sender or acknowledge/delete API until signed host-owned tenant/device sync authority, server-side idempotent RPC, conflict policy, and finance reconciliation are implemented and tested.

## SQLite authoritative reference resolver (explicit host wiring only)
`createSalesOrderSqliteReferenceVerifier` now checks actual customer and product master rows from SQLite, with org/branch association, active status and nondeleted records. A separate trusted warehouse+company resolution callback must explicitly return true; missing/false/truthy-object proof denies the write. Shared-org product selection is OFF unless a trusted host expressly opts in. Tests use real SQL.js SQLite including stale references before confirmation. No shipping app mounts this resolver or accepts renderer authority.

## Persisted-record integrity
SQLite read now rechecks all order and line totals in exact BigInt minor units, baseline immutable create identity, canonical IDs/timestamps, line uniqueness, version and invoice/status consistency before returning stored data. Corrupt JSON is not trusted for checkout, export or sync replay. Negative regression tests cover tampered money, identity, invoice and revision. This is not a cryptographic signature and does not replace server authorization.
