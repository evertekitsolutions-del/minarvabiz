# Universal business types — incremental implementation contract

Status as of 2026-10-18: UBP-01 preset registry and tenant presentation parser merged in PR #478; UBP-02a cloud business-profile/product-attributes **source migration** merged in PR #479 (production application unverified); UBP-02b local SQLite display-cache parity merged in PR #480. UBP-03a proposes pure test-backed FEFO lot selection and IMEI/serial preflight rules in the current PR, **not yet plugged into checkout**, with an additive **source migration** for cloud batch/serial typed tables in UBP-03b (not yet applied to production and without authoritative stock locks). UBP-05a adds a **pure unit/area calculator with bigint precision and test-covered 0.001 billable units** (not yet wired into POS, inventory or GST). UBP-04 appointments, UBP-06 dynamic billing, and UBP-07 atomic journals are still unimplemented. **Do not claim all 100 verticals are operational.**

## Non-destructive integration
Keep existing organizations/branches, products, variants, sales, payments, accounting, appointments/service and tenant RLS. **Do not introduce a second companies/items/invoices source of truth.** The requested conceptual `companies` maps to existing organizations, `items` to existing products + variants and `appointments` to existing service scheduling where available. First inspect live constraints, existing RLS and SQLite mirror before any migration.

## Five groups and capabilities
- RETAIL: barcode/QR scan, rapid POS, credit ledger.
- EXPIRE_BASED: batch, expiry, FEFO and regulated-goods compliance.
- SERIALIZED: unique IMEI/serial per inventory unit, warranty, return linkage.
- DIMENSIONAL: units and length × width conversion with explicit precision and rounding.
- SERVICE: appointments, resource/technician availability, job cards, status and deposits.

The **100 business types** are configuration presets, not 100 schemas. Company business group and business type must be tenant-owned and server-verified. Modules are additive capabilities (e.g. a repair shop may also sell serialized devices); never hide capabilities solely because of a single group. Plan entitlements, roles and branch permissions are checked on the server and in Electron main process; UI routing alone never grants access.

## Data model, proposed for migration review
Use existing tenant primary keys and references, NOT new duplicate masters:
- organizations: business_group, business_type, configuration JSONB with constrained allowed keys.
- products: attributes JSONB for sparse business-specific attributes; common searchable attributes remain typed columns; GIN index only for verified query patterns.
- inventory_batches: tenant, product, batch, expiry, received quantity, available quantity, warehouse; unique tenant/product/batch/warehouse; CHECK nonnegative.
- inventory_serial_units: tenant, product, unique serial/IMEI (tenant-scoped), stock status, warranty, sale-line linkage; transactional reservation.
- appointment_resources, appointments: tenant/branch, resource, start/end timestamptz, timezone display policy, customer, service, status; prevent overlapping confirmed resource bookings with PostgreSQL exclusion constraint.
- invoice_line_measurements: tenant, invoice line, unit, length/width as numeric, conversion factor; no floating point for financial amounts.
- posted invoice/accounting: existing journal tables, idempotency keys and immutable postings; no parallel journal subsystem.

RLS on every new tenant table, matching current auth membership and branch grants. Foreign keys must enforce tenant consistency (composite tenant+id where supported). Indexes: (tenant_id, created_at DESC, id) for invoices, (tenant_id, product_id, expires_at) for batches, (tenant_id, serial) unique, (tenant_id, resource_id, starts_at) for bookings; pagination with keyset cursors. Tenant + financial year invoice numbering uses existing numbering authority. Partitioning only after measured bottlenecks.

## Unified billing and accounting transaction
1. Authenticate user and tenant; validate license, branch and permissions on server.
2. Resolve company capabilities from authoritative tenant profile, then choose barcode / expiry / serial / dimensions / slot line editor. Shared customer, tax, discount, attribution, payments remain common.
3. Validate available batch/serial, slot lock, dimension quantity and GST rules. Use decimal/integer minor-unit math; client estimates are not financial authority.
4. In **one** authoritative database transaction, reserve stock or booking, write invoice header/lines and payment allocation, post balanced journal debit/credit, and record idempotent outbox event. Reject entire transaction on failure.
5. For offline SQLite, record provisional local IDs/outbox, enforce local constraints and reconcile through existing conflict policy; **never** promise an offline booking is globally conflict-free before sync.
6. Prevent duplicate sales and journal entries with tenant-scoped idempotency keys; support reversal journals for voids/refunds.

## Delivery gates
A. Profile type + preset tests (this PR).
B. Audit existing schema and create additive migration and SQLite parity, with tenant isolation tests.
C. Dynamic web/desktop dashboard and five reusable POS row editors, feature flags, accessibility tests.
D. Booking conflicts, expiry/serial reservations and dimensional precision tests.
E. Transactional accounting posting, offline reconciliation, security review, CI + field pilot.

No additional paid infrastructure or AI is introduced before the first 25 paying customers review checkpoint.
