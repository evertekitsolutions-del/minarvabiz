# Minarva Biz — Universal Business Platform for 100+ Verticals

**Design status:** Architecture APPROVED in chat on 2026-10-18 (Shared Core + Modular Capabilities). This written specification is **awaiting owner review**. No production database migration, live checkout change, or 100-vertical rollout is authorized by this document alone.

**Project:** `evertekitsolutions-del/minarvabiz` (Next.js 15, TypeScript, Electron, SQLite, Supabase/PostgreSQL, offline-first sync).

## 1. Purpose, success criteria, exclusions

Deliver one maintainable **Hybrid SaaS + offline-first** business operating system with 100 configuration presets across five major business groups. Each tenant sees a fast, accessible default dashboard and point-of-sale editor suited to its workflow, with capabilities combinable across groups. Sales, service bookings, inventory, payments, GST, receivables and accounting reuse existing authoritative records. User data remains tenant-isolated, portable, recoverable and consistent across offline/online modes.

Success requires:
- All 100 presets can be selected during onboarding without duplicating business-specific product or sales tables.
- The group profile selects default components, but capability overrides allow hybrid businesses (CCTV installer = serialized + service + POS).
- One safe checkout command posts an **idempotent, balanced financial result** and prevents duplicate sales, serial allocation, over-selling and confirmed slot overlap.
- Existing customers continue using the current POS/normal billing paths until the relevant feature flag and compatibility tests pass; no destructive migration or automatic changes to historic data.
- Windows offline billing stays usable; conflict resolution and accounting reconciliation are explicit, never silently overwrite posted facts.
- Every new table, RPC and frontend data source has tenant, role, branch and license enforcement. UI routing is **not** an authorization boundary.

Not in scope of the first implementation batch: jurisdiction-wide regulatory compliance certification, payment gateway integration, automated prescriptions, excise reporting, automatically fulfilled website/e-commerce features, 100 distinct bespoke workflows or native Android/iOS distribution. No new recurring paid infrastructure/AI before the first 25 paying-customer review checkpoint.

## 2. Verified repository and live database baseline (read-only inspection)

Inspected on 2026-10-18:
- GitHub main at `e7a44e378bc31523c1c547c6904d41d079bd8d0a`; PR #478 remains open, with isolated `packages/types/src/universal-business-profile.ts` and `docs/UNIVERSAL_BUSINESS_100_TYPES_ARCHITECTURE.md`. That type module is **not** wired into the app yet.
- Live Supabase project `wmjgefbaliuwmaxyzxkq` contains `public.organizations` (only `id/name/created_at`), `organization_members`, `branches`, `products`, `sales`, `sale_items`, `payments`, `journal_entries` and `journal_entry_lines`. **No `public.appointments`, `inventory_batches` or `inventory_serial_units` exist at inspection time.**
- `products` has SKU, barcode, size/color, parent-product variant linking, prices, stock, tax, branch, org and version. `sales.invoice_number` is **globally unique in the current schema**. Do not replace it with tenant-scoped numbering without resolving the legacy constraint and current number generator.
- Online `public.create_sale` in `supabase/migrations/20260924_atomic_sales_payment_stock_rpc.sql` already handles sale + payment + stock with auth/tenant checks. Separate `packages/business-logic/src/sales-accounting.ts` and `accounting-store.ts` implement ledger planning/posting. The full server-side sale/payment/stock/**journal** atomic invariant has **not** been verified; must be developed and proven rather than assumed.
- `packages/ui/src/components/sales/PosBilling.tsx` and `NormalBilling.tsx` are active shared editors. `apps/web/src/app/(app)/sales/page.tsx` calls `store.createSale`.
- `packages/business-logic/src/appointments.ts` has local validation/conflict calculations but no persisted cloud appointment resource reservation.
- Offline persistence uses `packages/database/src/sql/sqlite-ddl.ts`, `packages/database/src/adapters/sqlite-domain.ts` and `apps/desktop/src/lib/sqlite-bootstrap.ts`; sync transport in `packages/sync/src/supabase-adapter.ts` and `packages/business-logic/src/outbox-bridge.ts`.

**Source-of-truth rule:** conceptual “companies” = existing `organizations`; “master items” = existing `products`/variants; “orders” = existing sales and service domain tables; booked appointments use a *new* dedicated scheduling aggregate linked to the existing tenant/customer/staff schema. Do not create parallel company, product, sales, payment or journal masters.

## 3. Five business groups: presentation default, not a hard partition

`BusinessGroup` is `RETAIL | EXPIRE_BASED | SERIALIZED | DIMENSIONAL | SERVICE`. At sign-in, resolve tenant membership and a **server-authoritative** business profile. Supply default capabilities by primary group; allow additional admin-configured capabilities after validating plan entitlement, role, business rules and any regulated prerequisites.

| Group | Default capabilities | Default dashboard / row editing |
| --- | --- | --- |
| RETAIL | barcode, inventory, customer credit | SKU/barcode search, quantity, quick tender; high-density POS |
| EXPIRE_BASED | barcode, batch/expiry, inventory | batch + expiry picker and FEFO warnings; optionally compliance capture |
| SERIALIZED | barcode, serial/IMEI, warranty | one serial per unit, scan/search and unique allocation |
| DIMENSIONAL | barcode, quantity/unit conversions, measurements | width/length/units/area calculator inside line editor |
| SERVICE | appointments, resources, job status, optional deposit | calendar and resource grid, slot selector, service job card |

A module must not disappear merely because another group is primary. `CCTV & Security`, `Computer Repair` and `Water Purifier` typically need serialized *and* service modules; `Footwear` needs variants; `Food Truck` needs retail and portable/offline checkout; `Photo Framing` needs measurement and a service job. This is configured per business type then optionally overridden by a verified tenant admin. A disabled feature never invalidates historic financial records.

Group-specific UI changes display and editing only. They may not grant permissions, generate new tax rates, set license entitlements, or trust arbitrary user-supplied `org_id`.

## 4. Configurable 100-preset registry

Every item supplied in the owner's five groups is preserved by a stable numeric ID (`001`–`100`), a durable machine code (e.g., `retail_kirana`), a display name, default group and optional capability/add-on list. Localized labels must not be used as database keys. Store registry definitions in versioned shared TypeScript configuration with tests for 100 unique IDs/codes and valid capability combinations; optionally mirror them in an immutable read-only seed table for management APIs. A shop selects exactly one primary preset, but can enable compatible additional capabilities.

**Preset catalog to implement (number/name; the group ranges are authoritative):**

- **RETAIL 001–030:** 001 FMCG/Kirana; 002 Fancy; 003 Gift/Toy; 004 Footwear; 005 Stationery/Bookstore; 006 Mobile Accessories; 007 Garments/Textiles; 008 Auto Spare Parts; 009 Sports/Fitness Equipment; 010 Pet Food/Supplies; 011 Fruit/Vegetable; 012 Bicycle Sales; 013 Computer Accessories; 014 Plasticware/Houseware; 015 Tea/Coffee; 016 Ice Cream; 017 Juice/Shakes; 018 Fast Food; 019 Sweet Stalls; 020 Paan/Cigarette Kiosk; 021 Crockery/Utensils; 022 Innerwear/Hosiery; 023 Bags/Luggage; 024 Automated Laundromat; 025 Drinking Water Vending; 026 Uniforms; 027 Pooja Supplies; 028 Baby Products; 029 Highway Dhaba; 030 Food Truck.
- **EXPIRE_BASED 031–045:** 031 Pharmacy; 032 Bakery; 033 Fresh Meat/Poultry; 034 Dairy; 035 Organic Food/Supplements; 036 Agrochemicals/Seeds; 037 Feed; 038 Wine/Liquor; 039 Chemical/Solvent; 040 Lab Chemicals/Glassware; 041 Ice Block Factory; 042 Ayurveda Medicine; 043 Seafood Processing; 044 Frozen Food; 045 Beauty Supplies.
- **SERIALIZED 046–060:** 046 Mobile/Gadgets; 047 Electronics/Appliances; 048 Computer/IT Peripherals; 049 Battery Dealers; 050 Luxury Watches; 051 Tractor/Agri Machinery; 052 Musical Instruments; 053 Two-Wheeler Showroom; 054 CCTV/Security; 055 Water Purifier; 056 Generators; 057 Air Compressors; 058 E-Scooters; 059 Heavy Equipment Parts; 060 Premium Sneaker Resale.
- **DIMENSIONAL 061–080:** 061 Hardware/Power Tools; 062 Paint/Wallpaper; 063 Timber/Wood; 064 Plywood/Laminates; 065 Glass/Mirror; 066 Tile/Granite; 067 Electrical/Lighting; 068 Plumbing/PVC; 069 Curtain/Mattress/Fabric; 070 Sanitaryware; 071 Iron/Steel; 072 Cement/Bricks; 073 Wallpaper/Carpet; 074 Photo Framing; 075 Scrap/Recycling; 076 Awnings/Blinds; 077 Hydraulic Hoses; 078 Flour Mill; 079 Oil Expeller; 080 Flex/Signboard Printing.
- **SERVICE 081–100:** 081 Hair Salon; 082 Spa/Wellness; 083 Vehicle Washing; 084 Mobile Repair; 085 Computer/Laptop Repair; 086 Appliance Repair; 087 Upholstery Repair; 088 Watch/Clock Repair; 089 Photo Studio; 090 Notary/Typing; 091 Plumbing/Electrical/HVAC Contractors; 092 Turf/Court Rental; 093 Gaming Café; 094 Event Equipment Rentals; 095 Pet Grooming; 096 Daycare/Preschool; 097 Driving School; 098 Yoga/Fitness; 099 Co-working; 100 Bicycle/E-Bike Repair.

The group range is a default, **not** proof that every product in that shop uses that capability: e.g. some appliance accessories do not have serials; some groceries require expiry by batch. Product-level tracking mode (`none | lot | serial`) is validated independently of company defaults. Preset-specific optional needs (vehicle fitment, recipe/BOM, rental asset return, age/licensing/prescriptions, volume/weight) are additional tested modules, not arbitrary JSON flags.

## 5. Logical schema contract — additive PostgreSQL migrations

First compare **fresh migration replay** and live production shape; identify drift, missing constraints and offline snapshots. SQL should be delivered as ordered reviewed migrations in `supabase/migrations` and added exactly once to `supabase/MIGRATION_ORDER.txt`. No in-place edits to historical migrations. Use PostgreSQL `numeric` / integer minor units for money and stable IDs for transactional entities.

### 5.1 Tenant identity and metadata
- Extend `organizations` with `business_group text` (CHECK enum values), `business_type_code text`, `feature_config jsonb NOT NULL DEFAULT '{}'::jsonb` and `feature_config_version int NOT NULL DEFAULT 1`. For existing orgs without a selection, use a safe legacy behavior profile; do not automatically replace their working menus or billing. New customers choose type at onboarding.
- Extend `products` with `attributes jsonb NOT NULL DEFAULT '{}'::jsonb`, `tracking_mode text` (`none | lot | serial`, compatible with sales operations); keep typed fields for price, stock, barcode/SKU, unit, tax, parent variant. Validate allowed JSON shape/size/server-side namespace per preset; avoid sensitive personal, prescription or card data in arbitrary JSON.
- For consistency, attach an immutable product/line attribute snapshot to billed lines if genuinely needed for audit, **not** only a mutable product JSON reference.

### 5.2 Inventory lots and serialized units
- `inventory_batches`: `id uuid`, `org_id uuid NOT NULL`, `branch_id uuid`, `warehouse_id uuid`, `product_id uuid NOT NULL`, `batch_code text NOT NULL`, `manufactured_on date`, `expires_on date`, `received_quantity numeric(14,3)`, `available_quantity numeric(14,3)`, `reserved_quantity numeric(14,3)`, timestamps, optional supplier/receipt link. Nonnegative checks and quantity conservation; uniqueness scoped by tenant+product+warehouse+batch when warehouse nullable semantics are defined. Never sell expired/blocked inventory through the standard checkout path.
- `inventory_serial_units`: `id uuid`, `org_id uuid NOT NULL`, `product_id uuid NOT NULL`, `warehouse_id uuid`, `serial_kind`, normalized `serial_code`, original display, `status`, `warranty_from`/`warranty_until`, `sale_item_id uuid`, audit timestamps. Unique `(org_id, serial_kind, normalized_serial_code)` only where business rules demand it; preserve multiple manufacturer namespaces as needed. Assign a unit to at most one completed sale; reversals and returns transition through recorded state.
- Never store a list of serials or batches as the **only** source inside products JSON. Do not reuse sold serials via an ordinary product edit.

### 5.3 Bookings, measurements, and invoice-line links
- `booking_resources`: tenant/branch, resource kind (employee, room, bay, court, console, asset), stable resource ID, active flag and capacity policy.
- `appointments`: tenant, branch, customer, optional resource, service/product ID, starts_at/ends_at `timestamptz`, status (`draft, held, confirmed, in_progress, completed, cancelled, no_show`), display timezone ID, optional service-order and sale-item links, create/update version. For exclusive resource capacity=1 enforce no overlapping confirmed/held reservations in PostgreSQL (range exclusion constraint with tenant + resource, or equivalently locked overlap checks after schema proof); for multi-seat capacity use a separate capacity-counter/slot allocation implementation. Client-only conflict checks are advisory and never authoritative.
- `sale_item_measurements`: tenant, sale_item_id, unit, length, width, thickness or conversion factor where relevant, numeric scale, resulting billable quantity, calculation algorithm/version. `sale_item_allocations` (or equivalently separate typed links) maps sale lines to batch/serial/booking; enforce composite tenant relationships.
- For unsupported transaction types (returns, rentals, conversions) add specific aggregates only when requirements justify them; do not overload `sale_items`/`appointments` JSON into a universal “anything” table.

### 5.4 Tenant integrity and permissions
Every new tenant-owned relation uses `org_id` and passes same-org validation for every referenced product, customer, warehouse, staff, branch, sale and appointment. Prefer composite unique keys `(org_id,id)` on referenced parents plus composite FKs; where legacy nullable `org_id` prevents immediate enforcement, stage safe backfill/constraints separately and use a strict server-side guard in the interim. Treat failed backfill as a stop condition, not data to silently reassign.

Enable RLS on each newly created `public` table **before** granting client access. SELECT by authenticated organization membership; INSERT/UPDATE limited to authorized role and exact tenant/branch; destructive transitions via verified RPC and immutable audit. No blanket authenticated=full-access or `user_metadata` authorization. Restrict security-definer RPC execution, lock search path, check `auth.uid()` inside, and reject cross-tenant payload references. Protect sensitive fields (especially medicine, minors, IDs) separately from general catalogue data.

### 5.5 High-volume indexes and search
Create only indexes absent from inspected schema and backed by query patterns:
- Products: `(org_id, barcode)`, `(org_id, sku)`, and `(org_id, lower(name), id)` or text-search strategy for local tenant search; filter deleted/inactive products where appropriate.
- Sales: `(org_id, sale_date DESC, id DESC)` and selectively `(org_id, customer_id, sale_date DESC)`; sale-item join index `(org_id, sale_id)`.
- Batches: `(org_id, product_id, expires_on, id)` with available quantity predicate and warehouse scoping; serials: tenant-qualified unique lookup.
- Appointments: `(org_id, resource_id, starts_at)` and `(org_id, branch_id, starts_at)` plus exclusion-supporting GiST where required.
- Accounting: `(org_id, entry_date, id)` and reference-based idempotency; re-use existing journal indexes.

JSONB GIN only after measuring actual `@>` / `?` searches; arbitrary JSON indexing adds significant write cost. Favor keyset pagination, targeted select columns, batched item lookup, short locking transactions and production `EXPLAIN (ANALYZE, BUFFERS)` on representative test data. Partition only after measured limits. Invoice-number design must remain compatible with the **current global unique constraint**, keeping company code + financial-year collision-free; migration away from global uniqueness requires independent analysis.

## 6. Application architecture and routing

### 6.1 Verified profile acquisition
After sign-in and org selection:
1. Resolve `auth.uid()` → `organization_members` and branch grants server-side.
2. Read `organizations` verified profile with its registry version and selected business type; validate against canonical preset registry. No org ID or capability set supplied by a renderer can select a tenant outside current authenticated scope.
3. Intersect defaults + allowed company add-ons with **license entitlements and signed/verified local authority**. Degraded/offline profile may use the last verified signed profile snapshot within defined validity; on an unknown profile, fall back to existing safe UI without elevating capability.
4. Pass a presentation-only `BusinessUIProfile` to React/Electron renderer; servers and desktop main process independently enforce checkout and privileged writes.

Do not add five separate Next.js applications. Keep existing `/(app)/dashboard` and `/(app)/sales` routes. Inject group-specific homepage widgets/labels and row components into existing containers. Switching a tenant/type must clear all in-progress cart, booking holds and cached inventory selection for the previous scope.

### 6.2 Universal Billing UI contract
Common, reusable fields: customer/name/contact, currency, GST inclusion/exclusion and jurisdiction-aware tax components, optional HSN/SAC, line and document discounts, cashier or eligible staff sales attribution, notes, credits/Udhaar, cash/card/bank/UPI/split payment, invoice preview and printing, hold/resume and validated submit.

Five composable row editors:
- `BarcodeRowEditor`: keyboard wedge/scanner and manual search, multiple fast adds, duplicate barcode disambiguation, variant selector; no unsafe implicit quantity cap.
- `ExpiryRowEditor`: select server-reconciled lot with expiry/FEFO, validate saleability and expiry at *commit time*, display warnings for near-expiry, refuse blocked/expired units.
- `SerialRowEditor`: scanner input (IMEI or serial), validate format per type and quantity count, reserve exactly one available identifier per unit; ensure repeated scans cannot double allocate.
- `DimensionRowEditor`: choose unit/dimension scheme, compute length × width (or approved conversion), decimal-safe rounding, handle cut waste/offcuts only through explicit inventory operations; no silent flooring of billable quantity.
- `TimeSlotRowEditor`: choose service, resource, timezone, duration and calendar slot; server reserves one or capacity-limited resources; offline labels provisional until reconciliation.

Group-specific default panel is a *composition*, not an alternate financial engine. Add-on row editors may coexist in one invoice. Screen readers/keyboard navigation, density for desktop, simple mobile presentation, and scanner focus must be tested. Do not expose medical/customer sensitive metadata through product search.

### 6.3 Typed domain command
One versioned checkout aggregate: `CheckoutRequest { orgScopeFromAuth, branchId, idempotencyKey, customerId?, attributedStaffId?, lines: DiscriminatedLine[], discounts, taxContext, tenderSplits, creditAmount, expectedVersions }`. `DiscriminatedLine` has common `productId, quantity, unitPrice, taxCode` plus validated payloads by capability `batchId / serialUnitIds[] / dimensions / appointmentHoldId`. The authoritative server *ignores any client-supplied orgId for identity* and revalidates every financial amount, permission, inventory reservation and booking.

Results include `saleId, invoiceNumber, journalEntryId, stockAllocationRefs[], reservationRefs[], serverReceipt, duplicateReplay:boolean`, or a typed conflict/error with recovery steps. Statically typed validation is necessary but not sufficient; runtime validation remains mandatory.

## 7. Unified financial transaction and offline reconciliation

`create_sale` currently handles cloud stock/payment transaction; `planSalePosting` separately builds journal lines. Evolve this without a parallel bookkeeping system:

**Online commit boundary:** validated tenant-scoped RPC/service transaction → lock relevant warehouse/product/batch/serial/resource rows in deterministic order → validate physical stock, allotments, discounts, tax and tender totals → allocate exact serials/batches and confirmed slots → insert `sales`/`sale_items`/`payments` → post **existing** `journal_entries`/`journal_entry_lines` as one balanced debit/credit set → write idempotent change/receipt/outbox marker → commit. Any failed step rolls back the entire unit. No journal is posted merely by rendering a preview.

**Idempotency:** unique `(org_id, client_checkout_key)` and canonical payload fingerprint; same key+payload returns same sale result, different payload produces conflict. Retry after network timeout must not double-decrement stock or double-post journal. Invoice numbers generated/validated against existing uniqueness rules. Credit sale: AR debit; cash/bank/clearing debit; revenue and GST liabilities credit; cost of goods debit/inventory credit for applicable stock. Fees, discounts, reversals, refunds and mixed goods+services must be included in tests. Accounting totals must be exact in minor currency units/NUMERIC with documented rounding.

**Offline:** Windows SQLite accepts locally authorized provisional sale and journal/outbox with device id, source revisions and client key in atomic file transaction; human-readable receipt clearly identifies offline/provisional state where uniqueness cannot yet be globally guaranteed. After sync, authority verifies org/device/branch, deduplicates event, checks serials, lots, stock, booked slots and accounting. Rejections stay visible in a resolution queue; never silently overwrite, auto-complete a conflicting booking, mutate historic journal or claim cloud acceptance. Adopt currently existing snapshot/outbox recovery and permissions rules rather than inventing a second sync engine.

**Operational integrity:** a cancelled sale or return generates a permissioned reversal/reallocation workflow; no direct delete of posted accounting rows. Staff attribution is audited and distinct from attendance check-in. Booking deposit, deferred service completion and cancellation each have explicit posting moments; a booking alone need not recognize sales revenue.

## 8. Security, compliance and operational safety

- Profiles, subscriptions, license gates, RLS, explicit branch authority and cloud/desktop authorization must agree. Restrict privileged mutation APIs to server-trusted identities; no leaked service_role key or free-form mutation of `org_id`.
- Batch/expiry is an inventory aid, **not** drug-law or food-law compliance by itself. Pharmacy prescription controls, controlled products, excise/age policies, agri-chemical licenses, child records and consumer-protection requirements need independent jurisdiction-specific design/legal review before any public compliance claim.
- Encrypt/limit data where necessary, exclude medical and minor-sensitive attributes from generic product metadata, audit staff actions, define retention/export policy.
- Cloud vs SQLite migrations must include rollback/restore and mixed-client version compatibility. Preserve Windows v1.0.15 circulation until a verified upgrade. No mandatory Vercel/Render, paid AI or new recurring infrastructure as a hidden dependency.

## 9. Sequential deliverables with mandatory tests and acceptance gates

| Milestone | Independently testable outcome | Required verification |
| --- | --- | --- |
| UBP-01 | 100 preset registry, typed server-validated group/capability mapping, org selection with safe legacy default | 100 ID uniqueness, bad group/flag reject, tenant and role isolation |
| UBP-02 | Additive org/product schema and JSON validation; index migration; SQLite parity | fresh replay order, constraints, schema diff, backfill dry run, branch/org denied |
| UBP-03 | Batch/expiry + serialized inventory typed tables and product editor | FEFO, expired block, serial uniqueness, concurrent sale, return/warranty links |
| UBP-04 | Resource/appointment persistence and calendar grid | timezone/DST, overlapping reservations, cancellation release, capacity concurrency |
| UBP-05 | Decimal-safe dimensional quantities and invoice-line measurements | length × width, units conversions, tax/rounding, fractional stock, barcode coexistence |
| UBP-06 | Unified POS shared shell + five optional row editors + verified profile routing | UI keyboard/scanner, save/hold, mixed items, no privilege bypass, responsive layout |
| UBP-07 | Atomic cloud checkout with allocations, payments, existing journals and idempotency | balanced journals, error rollback, parallel checkouts, failed network retry, credit/returns |
| UBP-08 | Windows SQLite / online sync compatibility and conflict resolution | offline restart, device revoke, replay, booking/serial conflicts, rollback/restore |
| UBP-09 | Industry presets rollout, pricing/feature gating and pilot sign-off | one workflow test per preset; regulatory claims locked until evidence |

Every milestone: failing regression test first → implementation → passing focused + full relevant suite → security review → GitHub CI GREEN → merge. No percentage claims from a type-only PR. PR #478 and its isolated shared types are a foundation, not a deployed feature.

### Mandatory negative scenarios
1. Cashier from tenant A tries product, serial or appointment owned by tenant B → denied with no write or data leak.
2. Two cashiers sell the same one-off serial in parallel → one success, one typed conflict, exactly one stock decrement/journal.
3. Offline booking overlaps an online confirmed booking → conflict queue, **not** silently confirmed.
4. Retry with same checkout key after timeout → original sale+journal returned; changed fingerprint → conflict.
5. Malformed JSON, negative/huge/nonfinite dimensions, invalid timezone, expired lot, forged group capability and forged staff identity → fail closed.
6. Sales/returns produce matching debit/credit and correct GST/credit ledger; unsuccessful checkout leaves zero partial postings.
7. Older Windows clients open upgraded snapshots without corrupting local data and can recover safely.

## 10. Owner approval and execution boundary

This specification expresses the approved **Shared Core + Modular Capabilities** approach and the intended outcome. Owner review of the **written spec** is the next gate. Once accepted, create concrete task-by-task plans using the Superpowers writing-plans skill, then implement in isolated PRs with full test evidence. **Do not apply production SQL or merge an unreviewed architecture merely because this document exists.**
