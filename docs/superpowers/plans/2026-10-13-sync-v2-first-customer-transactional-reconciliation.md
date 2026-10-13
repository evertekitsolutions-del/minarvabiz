# Minarva Biz — Sync v2 transactional cross-device implementation plan

**Status:** Owner review required before implementation. **Execution:** existing GitHub branch/PR, native implementation, test-first, exact-head checks, controlled merge.  
**Date:** 2026-10-13. **Design:** `docs/superpowers/specs/2026-10-13-sync-v2-first-customer-cross-device-design.md` (PR #388).  
**Existing baseline:** PRs #381–#384, #389 and #390 are **merged**. Do not redo them. The source-level first-customer commercial journey is tested in `docs/COMMERCIAL_JOURNEY_ACCEPTANCE.md`.  
**Goal:** A verified authenticated org can complete a financial operation offline on installed Windows, reconcile exactly once to PostgreSQL, and retrieve the same authorized branch records from a second Web/mobile device. No double stock, payment or ledger posting; retained pending operations on every failure.

## 0. Existing implementation facts and non-negotiable boundaries

- `packages/business-logic/src/outbox-bridge.ts` persists immutable event IDs, owner scope and sequence; `remote-write.ts` contains safe **master-only** scoped replay. PR #390 fences restored/mutated in-flight receipts; preserve this.
- `packages/sync/src/engine.ts` is generic/demo-facing, while `packages/sync/src/supabase-adapter.ts` uses per-table DML and a **separate** `outbox_events` insert for non-HR operations. **Neither is a financial transactional authority.**
- `supabase/migrations/20260924_atomic_sales_payment_stock_rpc.sql` already defines `create_sale(JSONB,JSONB,BOOLEAN)`, `record_payment(JSONB,JSONB)`, and `adjust_stock(...)`. These handle specific online operations but **do not commit all accounting journal rows and an immutable event receipt atomically**. `create_sale` treats matching sale ID + invoice number as idempotent without comparing full financial payload; do not treat that check as a sufficient replay receipt.
- `supabase/migrations/20260927_authoritative_org_rbac.sql` defines `current_user_authorization()` and organization role membership. Current implementation requires **exactly one** membership per actor; multi-organization membership is a separate global-core dependency, not something this plan silently claims supported.
- Shared accounting via `packages/business-logic/src/sales-accounting.ts`/`accounting-store.ts` creates balanced `auto_sale`, `auto_collection`, `auto_return` and other journals. The existing local first-customer flow has real fractional stock, tender splits, purchase/AP, returns and exchange cases. Reuse it.
- `supabase/migrations/20260919_accounting_core.sql` defines `accounts`, `journal_entries`, `journal_entry_lines`; `20260919_wms_foundation.sql` defines warehouse stock with separate `on_hand`/`reserved`. Global `products.stock_quantity` alone is **not** branch/warehouse authority.
- `apps/web/src/lib/data-source.ts` registers an authenticated writer with `verifiedOwnerScope` and existing `pgRpc`. `packages/database/src/client/postgrest.ts` already implements provider-neutral HTTPS/JSON RPC access. Reuse it; do not add another paid SDK.
- No production migration, customer data writes, license issuance, release publication or paid AI. PostgreSQL tests **only against disposable isolated test tenants**. The 25-customer rule is a spending review threshold, never an automatic upgrade.
- Preserve all 329 capability IDs and 111 AI IDs. Full Master Vision ~51% remains **provisional**; PR/CI counts do not increase it.

## 1. Contracts frozen for the first implementation slice

**Files:** `packages/business-logic/src/financial-sync-contract.ts` (new), `packages/business-logic/src/index.ts` (export), `packages/business-logic/src/__tests__/financial-sync-contract.test.mjs` (new).

Interfaces must be exported before callers exist; type-only interfaces do not imply a usable implementation:

```ts
type FinancialSyncOperationV1 = "sale.post"; // S5 adds typed operations one by one
interface FinancialSyncEnvelopeV1 {
  schemaVersion: 1;
  eventId: string; // original local immutable transaction-group/outbox event UUID
  organizationId: string; // assertion ONLY: server derives authoritative org from token
  deviceId: string; // registered UUID
  branchId: string;
  warehouseId: string | null;
  locationId: string | null;
  operation: FinancialSyncOperationV1;
  sequence: number; // monotonic per enrolled device
  occurredAt: string;
  expectedVersions: Record<string, number>;
  sale: Record<string, unknown>; // existing snake_case create_sale projection, not an invented sale
  payments: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  journal: Record<string, unknown>; // one complete balanced posted source journal and lines
}
interface FinancialSyncReceiptV1 {
  accepted: true;
  replayed: boolean;
  eventId: string;
  organizationId: string;
  serverCursor: string; // opaque server-issued position, NOT client clock
  requestDigest: string; // digest returned by trusted authority, not client proof
  committedAt: string;
}
type FinancialSyncApplyResultV1 =
  | FinancialSyncReceiptV1
  | { accepted: false; eventId: string; code: "version_conflict" | "stock_conflict" | "held_dependency"; reason: string };
```

Rules: JSON-serializable, immutable envelope projection, bounded size/line counts, supported role and branch/warehouse claims, finite integer-minor-unit accounting amounts with explicitly validated currency/exponent policy (do not hard-code INR or silently round). Reject unmatched local reference graph, unsupported operation/schema or unknown/ambiguous branch stock. No client-supplied user/role/org authority. No outgoing data until the whole sale + tender + inventory + posted journal graph is present. Old unscoped events remain held.

Server digest is computed from validated canonical PostgreSQL `jsonb` body, compared with saved server envelope on retry; the client may send a correlation digest but must **never** be trusted to certify its own receipt.

## 2. Six implementation slices (separate reviewable PRs)

### S1 — End-to-end RED harness and envelope/receipt validation

**Files:** `packages/business-logic/src/financial-sync-contract.ts`; `packages/business-logic/src/financial-sync-envelope.ts`; `packages/business-logic/src/__tests__/financial-sync-envelope.test.mjs`; `packages/business-logic/src/__tests__/financial-sync-receipt.test.mjs`; `packages/business-logic/src/index.ts`; `scripts/financial-sync-authority-e2e.sql` (test scaffold, not fake success).

**Interfaces:**
```ts
export function buildSaleFinancialEnvelope(snapshot: DomainSnapshot, eventId: string, verifiedOwnerScope: string): FinancialSyncEnvelopeV1 | { held: string };
export function validateFinancialReceipt(reply: unknown, expected: FinancialSyncEnvelopeV1, verifiedOwnerScope: string): FinancialSyncReceiptV1;
```
- RED: a sale with two payments and one `auto_sale` journal cannot form a valid envelope if any payment, account or journal line is omitted; unrelated/cross-scope records are forbidden.
- RED: unknown version, invalid UUID/sequence, mixed branch, unsupported currency precision, invalid stock and unbalanced journal produce `held`, not a partial packet.
- A post-sale local snapshot cannot, by itself, prove the **pre-sale warehouse/product version or precise stock debit**. Inspect `store.ts:createSale` and its outbox/mutation order first; for new sales, add **additive immutable operation metadata** captured at mutation commit (pre-op versions, branch/location, stock deltas and source reference), persisted and backward-compatible. For historical outbox groups lacking this evidence, `buildSaleFinancialEnvelope` returns `held: "missing_pre_operation_authority"`; NEVER back-solve an unverifiable version from current stock or mark historical events synced.
- Dependency join is by original sale outbox `aggregateId`, matching payment `referenceType:"sale"` + `referenceId`, and posted journal `referenceType:"auto_sale"` + `referenceId`; join journal/account lines by original IDs. Unknown/multiple source matches or an incomplete deterministic dependency group hold the sale.
- RED: HTTP 200 without exact event/org/digest/receipt fields, wrong server cursor or edited payload is **never an ack**. Unknown network result stays pending.
- Reuse `exportDomainSnapshot()`, `exportOutbox()`, existing `remoteCreateSale` projection, `planSalePosting` source journals and `toMinorUnits`; do not invent a new billing formula.
- GREEN: minimal parser/graph assembler + receipt validator; readonly result until S2 server authority exists.
- **Verify:** `node --test packages/business-logic/src/__tests__/financial-sync-{envelope,receipt}.test.mjs`; `pnpm --filter @minarvabiz/business-logic typecheck`; exact-head CI. Keep pending financial replay disabled.

### S2 — Atomic authenticated PostgreSQL sale + stock + journal + receipt

**Files:** `supabase/migrations/20261014_financial_sync_event_authority.sql` (new additive migration; date prefix must be rechecked against current live migration list), `supabase/MIGRATION_ORDER.txt`; `scripts/financial-sync-authority-e2e.sql`; `.github/workflows/ci.yml` (extend existing PostgreSQL 17 integration job; no new paid provider); `packages/business-logic/src/__tests__/financial-sync-authority-migration-contract.test.mjs`.

**RPC contract:** `public.apply_financial_sync_sale_event(p_envelope JSONB) RETURNS JSONB`, plus `public.find_financial_sync_receipt(p_event_id UUID) RETURNS JSONB` and reviewable org-filtered `public.pull_financial_sync_changes(p_cursor BIGINT, p_limit INTEGER) RETURNS JSONB` from S4. Never publish a new `RPC` in production until migration/RLS authorization is separately approved.

**Private server tables:** `financial_sync_devices` (org + device ID, active/revoked, authorized branch); `financial_sync_event_receipts` (unique `(org_id,event_id)`, canonical envelope, digest, device/sequence, source aggregate IDs, committed version/cursor); `financial_sync_changes` (monotonic cursor, org/branch, authorized record reference, immutable committed delta). RLS **enabled and forced**. Deny all browser/client direct INSERT/UPDATE/DELETE on authority/receipt/change tables. Restrict RPC EXECUTE to `authenticated`; `SECURITY DEFINER` with fixed `search_path = pg_catalog,public,pg_temp` and explicit internal `auth.uid()`, membership, device, branch, warehouse and role checks. No grant to `anon` or PUBLIC.

- RED in **actual disposable PostgreSQL**: same event+same payload returns saved receipt and exactly one sale, stock movement, payment, journal, audit and change; same ID+different payload rejects without mutations; cross-org, disallowed actor for the operation, revoked device, foreign branch/warehouse, unbalanced journals, stale product version and insufficient stock each roll back **everything**. The existing `sales.create` cashier role remains valid for allowed sales; do not accidentally ban authorized cashiers.
- Acquire transaction-scoped event-ID lock before receipt lookup, then deterministic lock order on relevant products/warehouse-stock/customer/account rows. No silent reuse of existing `create_sale` idempotency: a pre-existing sale without exact receipt is `held/conflict`, not accepted by invoice number.
- Reuse `create_sale` as an operation primitive **only if** its existing input/guards are proven equivalent; otherwise implement a dedicated validated operation under the same PostgreSQL transaction. Accounts and journal lines must be inserted before receipt+cursor finalization, with balanced debit=credit and correct transaction reference.
- Money conversion uses integer minor units at the validated currency exponent; PostgreSQL stores exact fixed numeric amounts, not floating-point rounding. Require a precise supported exponent/config; unsupported currency never posts.
- Warehouse stock must reconcile with product stock; when a branch has no explicit location or more than one eligible location, refuse ambiguous automatic deduction. No negative/reserved-stock bypass.
- **Verify:** `psql ... -v ON_ERROR_STOP=1 -f scripts/financial-sync-authority-e2e.sql` against an isolated PostgreSQL instance and repeat full migration `node scripts/replay-supabase-migrations-fresh.mjs` in a disposable local Supabase instance where available; CI real PostgreSQL service with failure-level assertions; `pnpm typecheck`. Run upgrade/fresh RLS-negative, rollback and manifest checks. Record the isolated DB setup used. Never point scripts at hosted production.

### S3 — Durable owner-scoped push and lost-response reconciliation

**Files:** `packages/business-logic/src/financial-sync-coordinator.ts`; `packages/business-logic/src/remote-write.ts`; `packages/business-logic/src/outbox-bridge.ts`; `packages/business-logic/src/persistence.ts`; `apps/web/src/lib/data-source.ts`; `packages/business-logic/src/__tests__/financial-sync-coordinator.test.mjs`; `packages/business-logic/src/__tests__/financial-sync-crash-recovery.test.mjs`.

**Interface:** `retryFinancialOutbox(limit?: number): Promise<{attempted:number; acknowledged:number; held:number; conflicted:number}>`; authenticated remote `applyFinancialEvent(envelope)` and `lookupFinancialReceipt(eventId)`. Writer contract captures session token/verified org/device/branch and revocation generation from existing `registerRemoteWriter`.

- RED: two overlapping retries cause one RPC attempt; timeout **after server commit** performs receipt lookup and does not re-post, while timeout **before commit** leaves immutable original queue. No generic per-record fallback.
- RED: logout, tenant switch, stale writer generation, edited/replaced outbox record (#390 guards), missing dependency or malformed receipt => no ack or cross-tenant counts.
- Preserve **atomic group acknowledgement** for sale+every payment+related journal; never ack a subset of a financial operation. Persist validated server receipt correlation before marking an event synced; survive SQLite process restart/restore. (The server receipt itself is not a cryptographic signature unless separately verified with a configured key.)
- Persist a stable registered `deviceId` and monotonic per-device sequence across restarts. Existing `outbox-bridge.ts` initializes a random device ID in memory and exposes `setOutboxDeviceId`; registration must pin the actual SQLite/browser-owned device, not a newly generated identity each launch.
- Add receipt/cursor storage to the existing `DomainSnapshot` with backward-compatible snapshot-version migration and native SQLite restore tests; no destructive overwrite of old backups.
- Separate and label safe master replay from held financial entries. No automatic financial replay until S2 PostgreSQL authority tests pass.
- **Verify:** `node --test packages/business-logic/src/__tests__/financial-sync-{coordinator,crash-recovery}.test.mjs`, existing `offline-scoped-master-replay.test.mjs`, `sync-v2-outbox-receipt-identity.test.mjs`, full business-logic test suite and Windows native persistence smoke.

### S4 — Branch-scoped cursor pull, staged hydration and manual financial conflicts

**Files:** `supabase/migrations/20261014_financial_sync_event_authority.sql` extension in an **ordered follow-up additive migration** rather than editing already merged migration; `packages/business-logic/src/financial-sync-coordinator.ts`; `packages/business-logic/src/persistence.ts`; `apps/web/src/lib/data-source.ts`; `apps/web/src/app/(app)/settings/page.tsx`; `packages/business-logic/src/__tests__/financial-sync-pull-reconciliation.test.mjs`.

**Interface:** `pullFinancialChanges(cursor: string | null, limit: number)` must use a **trusted server-issued monotonic bigint cursor**, org/branch RLS and bounded stable order. Persist cursor only after all incoming domain/warehouse/accounting revisions are staged and durably applied. Add bounded diagnostics `ready/held/conflict/accepted/lastReceipt` for verified owner, not for a remembered browser preference.

- RED: source device offline sale posts; authorized second device sees exact customer/stock/sale/ledger balances after pull. Wrong org or disallowed branch returns no data.
- RED: incoming cloud revision cannot overwrite pending local unacknowledged finance/stock; conflicting multi-counter stock yields manual hold, not LWW.
- RED: interrupted local apply rolls back the staged snapshot **and cursor**; retry is idempotent. Duplicate pages/out-of-order deltas do not regress record versions.
- Reuse `importDomainSnapshot`/native SQLite transaction-safe persistence; **do not** wire production financial operations into `syncBridge.runSync()` demo route.
- **Verify:** Node state/restart tests, existing `pending-pull-preservation.test.mjs`, `tenant-sync-integration.test.mjs`, Web E2E and Windows installed smoke. Cross-device claims require real PostgreSQL-backed authorization.

### S5 — Existing procurement/AP and returns/exchange transaction parity

**Files:** `packages/business-logic/src/financial-sync-envelope.ts`; `packages/business-logic/src/financial-sync-contract.ts`; `packages/business-logic/src/financial-sync-coordinator.ts`; additional ordered `supabase/migrations/20261014_financial_sync_business_operations.sql` (pick a unique fresh timestamp); `scripts/financial-sync-commercial-journey-e2e.sql`; `packages/business-logic/src/__tests__/financial-sync-business-journey.test.mjs`.

- Extend operation discriminant, one operation at a time: `purchase.post`, `goods_receipt.post`, `purchase_invoice.post`, `supplier_payment.post`, `return.post`, `exchange.post`, `collection.post`; preserve original operation IDs, reference edges and immutable journal IDs.
- Reuse `procurement-store.ts`, `phase5-store.ts`, `phase7-store.ts`, `sales-accounting.ts`, `accounting-store.ts`. Do not recreate pricing or invent opening AP.
- RED: two partial receipts 1.25+1.75, PO/invoice 150, bank/cash supplier payments, split-tender sale, partial return and exchange must conserve the exact existing linked fixture totals at cloud and peer-device boundaries; duplicate/lost response adds **zero** extra inventory/journal movements.
- RED: conflicting branch/location, reversed item cost, negative returns or invoice over-settlement rejects the **entire** event and leaves local queue untouched.
- **Verify:** `node --test packages/business-logic/src/__tests__/commercial-purchase-sale-recovery.test.mjs`, `financial-sync-business-journey.test.mjs`, real PG authority E2E, full suite and exact-head CI for every independently merged operation. No operation is declared complete merely because the sale RPC passes.

### S6 — Authenticated Windows/Web/mobile-browser evidence and controlled customer release

**Files:** `docs/SYNC_V2_FIRST_CUSTOMER_ACCEPTANCE.md` (new evidence packet); `docs/COMMERCIAL_JOURNEY_ACCEPTANCE.md` (only real new cloud evidence); `docs/PRODUCT_DELIVERY_BACKLOG.json` (evidence fields only, never fabricated acceptance); relevant existing browser/Windows CI smoke scripts.

- Record on isolated hosted/test organization: authentic user roles/devices/branches; physical licensed Windows offline sale; interruption at each commit/response/ack window; reinstall/restart/restore; second authorized browser/mobile round trip; unauthorized org negative; two simultaneous cashiers competing stock; physical A4/thermal output where required.
- Record actual RLS migrations, input/reference fixtures, before/after PostgreSQL row IDs, source SHA and exact-head/postmerge CI, signed Windows installer SHA256 and rollback; mark unevidenced physical customer UAT `pending`.
- Review minimum five failure classes below; never auto-publish or roll out a customer installer on successful CI alone.
- **Verify:** existing Windows deep-installed smoke, Web UI/security recovery E2E, real PostgreSQL tests and owner/operator independent signoff. Separate Windows publisher/production migration approval required.

## 3. TDD, CI and review loop for every slice

1. Pull **fresh** `main` SHA, open PRs and exact source, create one branch per independently accepted slice. Before production changes, write one failing behavior-level regression and verify RED output from Node/real PG CI; do not edit previously merged code without a regression.
2. Implement smallest complete slice with shared/core code; keep no new paid dependencies. Add branch/type/security/permission/failure tests and rerun until green.
3. Run `pnpm --filter @minarvabiz/business-logic typecheck`, `pnpm --filter @minarvabiz/sync typecheck`, `node --test` for affected paths, existing `pnpm --filter @minarvabiz/web exec tsc --noEmit`, native Windows CI, and existing exact-head GitHub checks. Full business logic suite must pass; passing only an isolated fixture is insufficient.
4. Independent review (fresh reviewer when available) checks tenant authority, event idempotency, ledger balance, warehouse dimensions and migration safety. Fix critical/important findings with RED→GREEN tests.
5. Merge by exact expected head SHA **only** when required checks are complete and green; verify post-merge `main` CI. **No unconditional GitHub auto-merge on currently unprotected `main`.**
6. Report actual completed acceptance outcomes with evidence separately from historical ~51%. Keep customer release v1.0.15 separate until a newer **published, signed** asset is verified.

## 4. Explicit five review-focus failure classes

| Class | Required failing-then-passing test |
| --- | --- |
| Duplicate or mismatched source identity | Same event ID after original ACK with altered sale amount/payment array/journal must reject, not reuse earlier receipt (S1/S2) |
| Cross-tenant/branch/device | Token for org B + org A event, revoked device, foreign warehouse and cashier lacking operation permission do zero writes (S2/S3) |
| Crash and uncertain commit | Kill or timeout after server commit and before local ack; one server receipt and one complete ledger/stock graph after restart (S3/S6) |
| Reordering and conflict | Two counters race for the last unit; never oversell, overwrite pending local state, or move cursor before local durable commit (S2/S4) |
| Money/quantity completeness | Unsupported monetary exponent, subprecision quantity, missing journal/payment/stock reference, unbalanced posting and partial AP fail closed (S1/S2/S5) |

## 5. Scope / status / handoff

This plan covers **S1–S6 in the approved Sync v2 spec**; **S1 must be implemented and tested before S2**. Other five-track programs (mobile PWA offline, licensing/updater, first-customer release, weighted capability audit) retain separate milestone plans. An online browser using the responsive Web UI is **not** equivalent to a standalone mobile app or durable offline PWA.

**Owner execution request:** Review the plan's first-customer and security contracts. On approval use the already chosen **native inline** execution method: ChatGPT writes each independently testable code section, GitHub Actions runs tests automatically, the assistant fixes failures/merges after exact-head green, and the user says Continue for the next section. No unsupervised paid 24/7 coding or silent live-production writes are implied.
