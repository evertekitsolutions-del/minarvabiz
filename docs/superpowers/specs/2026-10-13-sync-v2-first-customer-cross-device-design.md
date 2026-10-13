# Minarva Biz — Sync v2 First-Customer Cross-Device Acceptance Design

**Design status:** Proposed; requires owner review before implementation plan/code.  
**Design date:** 2026-10-13  
**Baseline:** `main` `956aa68954aea83a0dbcbaac2b7be06bc87ec315` (PR #387 merged, no open PR when explored).  
**Product authority:** `docs/MASTER_PRODUCT_PLAN.md`, `docs/PRODUCT_DELIVERY_BACKLOG.json`, `docs/DELIVERY_ACCELERATION_POLICY.md`, `docs/ENGINEERING_REUSE_POLICY.md`.

## 1. Approved customer intent and success criterion

One Minarva Biz product must operate as Windows Offline, Web Online and a mobile-accessible app, using the same business records. A customer can make permitted sales and other operations without internet; when connectivity returns, no successful financial operation may be lost, doubled, silently overwritten or exposed to a different tenant. Branch/warehouse and accounting totals must reconcile after peer devices refresh.

This document designs **one focused sub-project: A-SYNC-V2 transactional reconnection and cross-device proof**, not five independent sub-projects in a single plan. The owner's proposed five-track delivery batch remains: (1) Sync v2; (2) first-customer commercial acceptance; (3) mobile/PWA offline; (4) license, backup/restore, updater; (5) automated acceptance and weighted completion audit. Tracks 2–5 require their own scoped specs/plans with shared evidence gates; none is removed or implied complete here.

The request to advance the Full Master Vision by five percentage points is a **target, not an evidentiary percentage**. The historical ~51% remains provisional until a weighted capability baseline with verified customer/deployment/acceptance evidence supports another figure.

## 2. Repository state: reuse instead of rebuilding

### Existing production paths and useful safeguards

- `packages/business-logic/src/outbox-bridge.ts`: durable event IDs, sequence, payload and verified `ownerScope`; legacy/unscoped events deliberately are not auto-replayed.
- `packages/business-logic/src/remote-write.ts`: `registerRemoteWriter`, writer generation/revocation and `retryScopedMasterOutbox`; only category/customer/product masters are conditionally replayed. Financial and stock dependencies are explicitly held.
- `apps/web/src/lib/data-source.ts`: Supabase authorization/hydration and registered PostgREST writer; identity changes revoke writer access.
- `apps/web/src/app/(app)/settings/page.tsx`: honest limited-retry controls and held event counts.
- `packages/sync/src/{engine,supabase-adapter,conflict}.ts`: generic demo engine and PostgREST transport; attendance and roster already use authoritative atomic RPCs. The generic table insert/update and independent `outbox_events` insert are **not** an acceptable guarantee of financial atomicity.
- `packages/business-logic/src/persistence.ts`: full domain snapshot including business/outbox data; Windows uses the existing native SQLite persistence and restore protections.
- `packages/business-logic/src/__tests__/offline-scoped-master-replay.test.mjs`: same-owner replay, cross-tenant denial, pending financial hold, logout generation fencing, and explicit non-replay of deleted/malformed records.
- `docs/COMMERCIAL_JOURNEY_ACCEPTANCE.md`: source-level purchase/receipt/invoice/settlement/sale/refund/exchange reconciliation with fresh-process snapshot survival. This is **not** authenticated cloud cross-device UAT.

### Existing limitations; no invented acceptance

No evidence currently establishes one atomic, idempotent, authenticated cloud commit of the whole financial event/dependency graph from an offline Windows machine, followed by peer device reconciliation and customer sign-off. `syncBridge.runSync()` is demo memory-only, not a production sync button. A per-record API success does not prove the multi-table financial event is fully accepted. Existing source tests and Windows CI smoke do not replace physical customer printer/device/deployed RLS testing. No React Native/Android/iOS installer is claimed.

## 3. Approaches considered

**Chosen — Retain local-first shared core + transactional server acceptance.**
Preserve existing desktop SQLite, browser shared core and scoped local outbox. Add dedicated, authenticated PostgreSQL acceptance for a bounded ordered financial transaction envelope, committed with a tenant-scoped event receipt and audit in one transaction. Use version/ledger checks, explicit conflict records, and a server-issued incremental pull cursor. Accepted transactions are never re-executed when retries occur; timeout/unknown responses resolve by querying authoritative receipt ID before applying again. Low ongoing cost, standards-based and portable to self-hosted PostgreSQL.

**Rejected — Blind PostgREST upsert for every row.**
Existing generic adapter may write a business row and separately fail to persist its event receipt. Blindly replaying sales/payments/stock/journals could duplicate ledger entries or overwrite peer changes. It fails the financial safety requirement.

**Rejected — Cloud-only billing / generic last-write-wins or CRDT for money.**
Cloud-only breaks the offline requirement; last-write-wins on payments, inventory or double-entry accounting is unsafe. Keep conflict resolution explicit and operator-reviewed where deterministic transactional acceptance is impossible.

## 4. Architecture and contracts

### Client-side transactional envelope

Retain existing persisted source business mutations and immutable outbox IDs. Build a projection for **one complete operation** from existing transaction references, never invent new sale, payment or accounting records during replay. Each eligible envelope includes:

- `eventId` — stable UUID from original immutable outbox operation/transaction group;
- `orgId`, `deviceId`, authenticated actor, `branchId`, `warehouseId` as applicable, and monotonic local sequence;
- `operationType` (e.g. sale/settlement/return, purchase/receipt/invoice/payment) and dependent aggregate IDs;
- `expectedVersions`, stock movements, integer-minor-unit money lines, journal entries, per-transaction audit metadata;
- `schemaVersion`, a canonical request digest, client occurrence time and explicit receipt correlation.

The envelope is assembled from committed local snapshots and outbox entries. It cannot be edited into a successful authority claim by client-supplied `orgId`, `userId`, `role`, `branchId` or arbitrary accounting totals. These are **asserted against** server membership, RLS, registered device, branch/warehouse ownership, existing product/account references, computed balances and allowed role.

No destructive schema rewrite. If current durable outbox cannot safely represent an operation/group, keep those events visibly **held** and add an additive persisted representation with migration/rollback tests. Never discard legacy unscoped events or promote them to the current organization.

### Server authority and idempotency

Use PostgreSQL/Supabase-authenticated **atomic RPC**, no security-definer function without strict internal authorization. Build a small provider-neutral server adapter so a future self-hosted PostgreSQL service can expose the same HTTPS/JSON semantics.

- Server derives actor/organization from verified token and live membership, not client body.
- Validate known registered device and branch/warehouse permissions. Reject suspended/revoked sessions and foreign references before any write.
- Unique `(organization_id, event_id)` plus canonical payload digest and deterministic receipt; identical retry returns the original applied/rejected response **without** repeating journal/stock writes. Same ID with different payload is rejected as tampering/conflict.
- Lock required business aggregates in deterministic order and check expected versions, stock availability, balanced journals, positive/finite values, tax/rounding and document number uniqueness before mutation.
- Domain rows, stock movements, posted journal lines, audit and event receipt commit in **one database transaction**. Error/constraint conflicts roll the complete transaction back, preserve local queue and display actionable diagnostics.
- An acknowledged receipt includes the stable event ID, digest, committed aggregate versions and server cursor. Only a validated receipt for the currently verified auth/writer generation may mark the matching local event(s) accepted. Do not auto-mark a transaction accepted based on HTTP 200 without validated identities.
- Network timeout or lost response does **not** create a second financial posting: query by stable event ID/receipt and retry only if the server reports no applied event.
- Required additive migration defines RLS, uniqueness, indexes, RPC permissions and downgrade/recovery verification; review generated SQL, never replay migrations against existing production by hand.

**Important design boundary:** A mixed bundle is accepted only when its documented dependency/financial graph can be committed atomically. No fallback to generic `createSale`, `createPayment`, or independent `outbox_events` writes for this sync path.

### Local coordinator and reconciliation

Create a narrowly scoped production coordinator layered on `remote-write.ts`, not on the memory-only `syncBridge`:

1. Verify active session + organization membership + writer generation. Inspect pending transaction dependencies for that owner only; never disclose other-tenant counters.
2. Read a consistent persisted local snapshot and dependency graph; classify as `ready`, `held`, `conflict`, `inFlight`, `synced`, `failed`. Explicitly distinguish safe master retries from financial transactions.
3. Send bounded ordered envelopes with one flight per account/device; avoid duplicates on simultaneous reconnect/manual click. Later revisions wait for earlier authoritative receipt; do not assume event IDs imply time order across devices.
4. Verify server response and commit receipt to durable local storage before declaring `synced`. A crash between server commit and local acknowledgement recovers by receipt lookup.
5. Pull server-authorized branch-scoped deltas with a monotonic cursor, not an optimistic client timestamp alone. Stage and validate all incoming revisions; never overwrite pending local finance/stock on hydrate.
6. Apply peer updates in dependency order using current domain hydration/snapshot facilities and the native SQLite path; abort/restore on partial local apply. Persist cursor only after durable apply succeeds.
7. On version/business conflict, show local/server summaries, responsible branch, references and retry/hold state. For financial conflicts, require a controlled adjustment/reversal or explicit human authority; no last-write-wins.
8. Logout, org change, device revocation, stale token, missing RPC/receipt, or untrusted snapshot immediately halt sync. Events remain preserved; owner-scoped diagnostics remain private.
9. Reconnection and manual controls show honest `lastServerReceipt`, counts by verified scope and `held` reasons; existing demo Sync remains labeled demo-only and cannot be mistaken for production finance sync.

### Mobile client boundary

Responsive web and mobile browser use the authenticated shared read/write API. Device registration, tenant/branch filtering and server cursor semantics match Windows; standalone Android/iOS binaries are a **separate** delivery outcome, not proof supplied by this track. Offline-capable PWA caching and local transactional storage/replay require track 3's separate spec, browser quota/eviction/security tests and explicit user-facing reliability limitations. A mobile browser online round trip alone cannot satisfy offline-PWA acceptance.

## 5. Required business proof, CI and customer UAT

### Deterministic automated scenarios

1. **First-customer financial journey:** seeded fixture with real existing core creates purchase order → fractional receipt → vendor invoice → settlements → split-tender sale → partial return → exchange; cloud acceptance, a second authorized device pull and exact inventory/cash/card/bank/AP/AR/COGS/profit/journal conservation assertions.
2. **Offline crash and retry:** stop connectivity before upload, after atomic server commit but before reply, and after reply but before local acknowledgement; each time recover with exactly one server receipt and zero duplicate journal/stock movement.
3. **Two cashiers / competing stock:** simultaneous cross-device sale for same stock; one accepted, other refused or explicitly reviewed, no negative stock and no silent loss of locally pending sale; branch/warehouse totals remain correct.
4. **Cross-tenant / revoked actor:** org A event supplied under org B, foreign branch/device, wrong role, expired token, logout during flight and altered event digest all produce zero external writes, never leak records.
5. **Conflict/revision ordering:** duplicate ID, repeated retry, out-of-order revision, edited old snapshot and dependency-deferred customer/product master; fail closed with immutable event retained and explicit diagnostics.
6. **Native durability:** licensed installed Windows SQLite backup/restore/restart and supported update/recovery path; pending, applied and rejected event identities survive physical device restart, no ghost overwrite.
7. **Cloud/Web and mobile browser:** independently authenticated same-org user retrieves authorized records; different org receives none. Verify currency, numbers and branch/accounting reconciliations against server values.
8. **Migration/rollback:** fresh database apply and upgrade path, duplicate version/backfill tests, RLS/security-negative SQL tests and safe downgrade/rollback notes before any production migration.

Tests must exercise real Postgres transactional RPC semantics in ephemeral test infrastructure and real shared business core, not mock-only acknowledgements. Include Windows deep-installed smoke, browser E2E, TypeScript/build, security/RLS checks, exact-head CI and post-merge CI.

### Acceptance proof packet per outcome

Record: source PR and head SHA; exact-head CI; post-merge SHA+CI; deployed URL/environment and migration ID if applicable; authenticated role/device/branch test fixtures; reproducible inputs and expected server/SQLite values; actual captures/log identifiers; reviewer; customer operator/owner signoff; newly published signed installer version and checksum if released. Preserve failures and outstanding gates. No fabricated benchmark, performance result, device evidence or automatic acceptance.

Release gate: **no new production migration, customer data mutation, paid service, license issuing, or auto-update rollout** without separately authorized operator control and rollback readiness. CI-built installer artifact is not a published commercial release.

## 6. Delivery decomposition and dependencies

Each item below is a separately reviewable, TDD-based implementation/verification task. The implementation plan will specify exact file paths, interfaces, tests and step-by-step commands after this spec is approved.

| Slice | Independently testable outcome | Dependency |
| --- | --- | --- |
| S1 | Reproduction harness and authoritative transactional receipt contract, including RPC loss/duplicate cases | Existing core and outbox |
| S2 | Additive RLS-protected Postgres atomic event authority for one complete sale/payment/stock/journal envelope | S1 |
| S3 | Persisted client envelope and verified owner-scope, crash-safe receipt reconciliation, one-flight replay | S2 |
| S4 | Server cursor pull, staging, local rollback and explicit financial conflict review across branches | S3 |
| S5 | Extend existing purchase/receipt/AP/refund/exchange and master dependencies into the same safe transaction protocol | S4 |
| S6 | Real authorized Web/Windows/second-device E2E, physical UAT evidence and controlled release assessment | S1–S5 |

Do not mark a slice accepted because another slice's test passed. Defects in already merged functionality are repaired via root-cause regression tests without unrelated optional hardening work.

**After this sub-project:** independently design and plan (a) first-customer Windows commercial onboarding and release UAT; (b) mobile PWA offline durable client; (c) license/provider-neutral updater and recovery; (d) release/weighted capability audit. Their specs must reference these exact sync contracts rather than duplicate a second sync engine.

## 7. Outcome and percentage reporting

A-SYNC-V2 only becomes `accepted` when the business proof packet includes deployed, authenticated cross-device and physically licensed Windows evidence where required; source-only green CI is `implementation`. The entire Master Vision retains all 329 registered capabilities, all 111 AI feature IDs, industry/country packs and later phases.

Before claiming 56%, prepare a versioned weighted matrix with mutually exclusive capability IDs, baseline weights summing to 100%, measurable acceptance criteria, links to real evidence, independent reviewer approval, and a denominator covering every agreed master capability. An unknown/untested capability remains `unverified`, not automatically 0% or 100%. No arbitrary +1% per PR, per test, per engineer day or per track. Until that audit exists, show **~51% historical provisional** and counts of independently verified acceptance outcomes separately.

## 8. Security, privacy, and zero-cost constraints

- No mandatory recurring paid cloud/AI dependency before owner approval (25 paying customers is a review checkpoint, not automatic authorization).
- Preserve customer data privacy, signed device authority, RBAC/RLS, audit trail, migration reversibility and support for future Minarva-owned PostgreSQL/S3-compatible infrastructure.
- Avoid provider-locked business logic and new libraries without license, security, maintenance and portability review.
- Preserve current Windows, Web, Offline and Hybrid behavior; this spec adds capability without replacing working customer paths.
- Do not re-enable abandoned local Ollama or unverified paid autonomous source agents.
- No acceptance without CI, runtime, deployment and, where called for, human/physical customer evidence.

## 9. Owner review decision

Review this specification for the Sync v2 first-customer cross-device track. Approval of this **written spec** authorizes writing its exact implementation plan, not skipping that plan or unreviewed customer/production actions. The plan then receives a separate review and execution-method decision before changing product code.
