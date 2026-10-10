# HR-004 Shift/Roster — Delivery and Remaining Acceptance

**Status:** Partial implementation; not production-complete  
**Verified baseline:** main `fb6394fada4d85f58def9c2a19c3d8196d68ae09`, merged PR #312  
**Updated:** 2026-10-10  
**Scope:** Shared Web, Windows SQLite, hybrid PostgreSQL/cloud authority

## Implemented and merged

| PRs | Functional scope | Safety and verification |
| --- | --- | --- |
| #280–#283 | Shared shift scheduling, SQLite persistence, tenant PostgreSQL schema and audited atomic event authority | Revision, overlap, tenant/RLS and idempotent replay checks |
| #284–#289 | Continuation docs, recurring read-only previews, cloud adapter, revision consistency, shared Windows planner and IANA/DST instant resolver | No automatic recurring writes; separate production gates |
| #290–#291 | Authenticated roster cloud read, tenant hydration, atomic RPC outbox writer and ordered acknowledgement | No service-role browser key; preserved original event identity |
| #292–#293 | Soft shift activate/deactivate, history and monthly CSV export | Reject inactive new assignments, preserve historical entries, protect CSV cells |
| #294–#295 | Session generation revocation for queued writes; UTC-aware overlap/rest foundation | Late RPC cannot confirm a revoked session; DST validation currently opt-in |
| #296 | Cloud roster mapper corruption and identity checks | Fail closed for malformed dates, branch mismatch, absent shift or duplicates |
| #297 | Authorized Web roster edit/correct/cancel and explicit original-event retry | Shared-domain write, tenant-authenticated RPC, unload warning and stop-on-error |
| #298 | Read-only per-event local/Cloud conflict comparison | Tenant-scoped RLS reads, exact UUID queries, role/session consistency |
| #299 | Explicit Keep Cloud conflict decision | Cloud re-fetch; rejects stale UI, multiple pending or later dependent events; discard marker retains original immutable payload |
| #301 | Reviewed Reapply Local for one isolated same-ID Cloud conflict | New immutable revisioned event, audited supersession and awaited atomic RPC; rejected/uncertain result retryable |
| #302 | Actual sql.js SQLite binary backup, corruption/restore and event replay regression | Archived `discarded`, `synced`, `failed` events and immutable event identity preserved; corrupt restore rolls back |
| #304 | AES-GCM browser recovery-vault foundation | Strict roster event-only envelope, user/organization partition, no JWT storage, tamper detection and simulated reload |
| #305 | Authenticated pre-RPC encrypted Web checkpoint and post-reload quarantine | Current organization/role via PostgreSQL RPC, no cross-tenant event replacement, confirmation/retry checkpoint, explicit fail-closed recovery block |
| #307 | RLS-scoped read-only comparison of sealed crash-recovery event vs current Cloud | Bound 25 records; remote missing/hidden is ambiguous, no automatic import/replay |
| #308 | Explicit manager-reviewed single-event Web restore to local memory only | One same-ID update, current remote revision N-1, original immutable ID/device/sequence, full roster validation and separate manual Retry |
| #310 | Actual Chrome native IndexedDB/WebCrypto recovery smoke | Native non-extractable CryptoKey survives page reload; scope separation and tamper/erase tests; isolated CI demo only |
| #311 | Atomic encrypted outbox save with scope revision | A concurrent tab with stale revision cannot overwrite newer encrypted recovery data; legacy revisionless vaults migrate on next write |
| #312 | Atomic encrypted recovery erase | A stale manager tab cannot silently delete another tab's newly sealed event; explicit scoped erase only |

The exact-head #299, #301, #302, #304, #305, #307, #308, #310, #311 and #312 merge gates each concluded with **19 success, 2 optional skipped, 0 failure**, including CI, SAST, dependency/license, secrets, coverage, Web, Windows packaged/feature-click/deep installed smoke. An initial test-code syntax defect was corrected before green exact-head validation.

## Important limits — do not misreport as complete

1. **Web pending queue durability:** #304–#305 seal unconfirmed events to user/org-partitioned encrypted IndexedDB before RPC. #307 permits read-only authorized comparison, and #308 permits a confirmed single safe same-ID update restore **to browser memory only**. The original sealed event remains intact; **Retry is a separate explicit action**, not auto-RPC. Multi-event dependencies, hidden/different-ID Cloud records, browser eviction and real authenticated browser restart/tenant-swap UAT remain incomplete. Windows SQLite v14 snapshot/backup is separate.
2. **Conflict reconciliation:** reviewed **Keep Cloud** and **Reapply Local** are implemented for one isolated same-canonical-ID event. Reapply Local re-fetches the current revision and creates a NEW immutable event under the existing audited RPC. Cross-device conflicting staff/day creations with **different IDs**, multi-event dependency recovery, and durable browser crash recovery remain incomplete. No silent last-write-wins.
3. **Timezone/DST:** shared `checkZonedRosterSlot` resolves actual UTC instants with explicit branch IANA rules. PostgreSQL trigger currently validates wall-clock overlap and does not yet provide tenant-owned branch timezone/DST branch-policy enforcement or UTC minimum-rest on the server.
4. **Minimum rest and labor policy:** current local planner numeric minimum-rest input is not a centrally versioned approved organizational policy. A server-authoritative configurable rest policy, statutory pack integration and migration-safe history remain outstanding.
5. **Recurring rosters:** weekly/monthly previews exist. Manager review, approval/rejection, atomic batch submit, conflict analysis, timezone checks, approvals audit and server rollback semantics are not complete.
6. **Production verification:** no named legitimate customer manager/cashier authenticated production UAT was executed. Read-only Supabase metadata verifies installed tables/RLS/FORCE and an authenticated-only RPC. These checks do not prove a real role-restricted mutation or customer data readiness.
7. **Installed Windows customer release:** source CI smoke is not a released customer setup file. Last confirmed stable installer is v1.0.15 until live release assets, checksum, updater and installation acceptance prove otherwise.
8. **Full Master Vision:** approximately **51% estimate**, not HR-004 percentage and not a measured claim that payroll, holidays, leave, online stores, manufacturing, country packs or AI are complete.

## Required next engineering slices

- HR-004A (partially complete): one-event same-ID **Reapply Local** reviewed, audited and exact-head verified in #301. Next extend canonical different-ID same-staff/day identity review and ordered dependent-event recovery; never discard third-party changes or bypass tenant authority.
- HR-004B (partial): #304–#305 encrypted pre-RPC checkpoint and quarantine; #307 read-only comparison; #308 explicit single same-ID local restore with unchanged original event and separate Retry. **Next** deliver real browser IndexedDB crash/relogin/tenant-switch/eviction acceptance, multi-event and different-ID canonical conflict-safe recovery, audit and eventual repeatable customer UAT. No auto-replay; XSS/profile theft and browser storage eviction remain risks.
- HR-004C: tenant-owned IANA timezone and DST fold/gap policy + centrally approved minimum rest; additive PostgreSQL migration with authorization, server enforced UTC overlap/rest and cross-branch historic shifts; reproducible PostgreSQL E2E.
- HR-004D: shift templates and recurring roster approvals including review, versioned policy, audit, batch atomicity, correction/cancellation and explicit conflicts.
- HR-004E: browser and **real installed** Windows UI feature UAT, further customer-grade native SQLite/backup disaster recovery (engine-level regression is verified in #302), PostgreSQL production integration and legitimate authenticated customer UAT; separately verify new signed installer and updater. No synthetic customer production fixtures.
- Then continue HR-005 Holidays, HR-006 Leave, HR-008 Late/Early, HR-009 Break, Payroll and Employee Self-Service per authoritative Master Plan.

## Engineering invariants

All writes pass shared `staff.manage` authorization and existing server organization-membership checks; browser never holds service-role keys. Event receipt, optimistic revision, tenant RLS and audit history cannot be bypassed. Do not treat CI success alone as live production UAT. Preserve all Master Vision modules, existing paid-service freeze until the ~25-customer review checkpoint, and provider-neutral PostgreSQL/S3/self-host AI portability.

**Continuation:** Verify live `main`, PRs/issues/workflows first; read `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, engineering/review governance and this file before changing HR-004 again.

## Encrypted Web roster vault acceptance — #304–#305

The AES-GCM Web vault is not a cloud-side vault and does not carry server credentials. It binds the encrypted record to the user ID and organization ID from the existing PostgreSQL authorization RPC; source/user-provided role claims alone are never sufficient. It stores non-extractable CryptoKeys *inside the same browser profile*, preventing plaintext-at-rest leakage but not same-origin XSS or a compromised browser profile. #305 persists unconfirmed event bytes before RPC and retains a sealed record on RPC failure. On refresh, it shows a quarantined recovery warning and blocks edits; it does **not** yet merge/restore the event back into the active roster or mark the Cloud result as accepted.

Acceptance requires verified authorized reviewer actions, no cross-tenant restore, exact immutable event replay ID/device/sequence/payload, safe same-day/different-ID conflicts, revocation during read/write, full real browser IndexedDB restart/eviction simulation, audit and server authoritative RLS. Only after passing these gates may HR-004B be called complete.

## Web encrypted recovery advance — #307–#308

The manager may read at most 25 saved pending events with an RLS-scoped authenticated comparison. Missing/hidden Cloud rows cannot be classified as absent; they never authorize a forced insert. One manager-confirmed, unconfirmed same-ID update may be restored to current *local browser memory* only when the current Cloud record is visible and exactly one revision earlier, every scoped session/writer check remains unchanged, there is no other unresolved queue and the full roster snapshot validates. This action does not contact the Cloud writer and does not erase the original encrypted vault; a further user-selected Retry is necessary. Regression tests verify denial for stale revisions, unauthorized sessions, canonical mismatches, conflicting queue and changes to historical shift timing. Exact-head CI #307 and #308 passed 19 checks each with 2 optional skipped, but this is not live customer authenticated UAT or real browser-profile disaster recovery acceptance.

Remaining production acceptance: real IndexedDB browser restart/relogin/login-different-user/org tests; storage eviction and partial-write recovery; controlled multi-event dependencies/canonical same-day different-ID merging; server IANA DST/min-rest, recurrence approval and a new verified signed Windows release. Full Master Vision remains an estimated **~51%**.

## Browser vault race-safety acceptance — #310–#312 (2026-10-10)

- #310 uses pinned Chrome in GitHub CI and **actual TypeScript vault source**, not just mocked IndexedDB storage. Confirms AES-GCM key non-extractability, browser page reload/decryption, organization isolation, ciphertext tamper rejection and scoped erase. These are engine/browser smoke results, **not** a real authenticated customer production UAT.
- #311 adds an optional revision field to existing encrypted vault records with no IndexedDB version/schema migration. Legacy v1 records without revision read as revision 0; first atomic write promotes to 1. Per-scope IndexedDB `readwrite` transaction reads stored revision and commits only when the optimistic expected revision matches. Concurrent tab losing the race fails closed, preserving winner's sealed event; Node and native browser regressions cover that behavior.
- #312 applies the same atomic expected-revision check to scope erasure. Explicit cleanup of an old revision cannot erase newer concurrent changes. There is **no automatic deletion, restore, Cloud replay, or cross-tenant merge** in these PRs.
- Open HR-004B gaps remain: browser profile eviction (data may be irrecoverable), two-tab user-facing conflict review/resolution, multiple dependent saved events, real authenticated relogin/organization switching, multi-device reconciliation, and customer production UAT.

## HR-004C production gate — PostgreSQL server timezone/DST and rest (2026-10-10)

Read-only code audit finds `staff_roster_guard()` currently compares naive `work_date + start_time` and `work_date + end_time` values, including overnight shifts, rather than actual UTC instants resolved through per-tenant branch IANA timezone and explicit DST policy. Core `checkZonedRosterSlot()` implements UTC comparison, gap rejection and fold disambiguation **only when the caller supplies a policy**. Current PostgreSQL does not yet enforce tenant-owned approved branch zone, DST fold/gap choice or a centrally configured minimum rest.

**Required next implementation:** additive schema/migration for tenant/branch effective-dated policy and manager authorization; history-safe default/activation design; server-side UTC shift instant calculation with explicit gap and fold validation, overlap and minimum-rest across overnight, DST transitions and branches; tenant isolation and audit; PostgreSQL E2E that proves unauthorized changes denied and both DST and rest violations refused. Do not activate a production migration or claim RLS/UAT readiness based solely on TypeScript tests. Preserve country packs, payroll, history and migration portability.

**Full Master Vision estimate remains approximately 51%.** Stable Windows installer remains separately confirmed v1.0.15.

## HR-004C manager draft editor — 2026-10-10

Live baseline `d30a7553a1420da91930947cf9292b5e891dd3ed` includes #314's
PostgreSQL IANA resolver and #315's audited tenant/branch policy DRAFT schema.
Those supersede older statements above that no policy schema exists. Neither
migration activates UTC overlap/minimum-rest enforcement in the roster trigger.

This branch connects the existing manager roster page to policy draft read,
create and revisioned update. The editor requires authenticated roster hydration;
each operation resolves server membership, pins user/token/writer generation,
checks manager role and rejects responses from another organization. Save uses
only the existing audited draft RPC, with no direct table DML or browser queue.
The response must match the requested identity, next revision and values.

An explicit Load action is required. Conflicts preserve the unsaved form and show
the current Cloud draft for separate review; failed/uncertain saves require reload.
The UI identifies drafts as not enforced and has no approval/activation control.
Branch/effective-from identity cannot change while editing a saved revision.
This Web-only draft configuration does not assert Offline/Hybrid policy parity.

Verification added: executable client validation/tenant/session/conflict tests,
and real Chrome rendering of the actual React editor with isolated transport
fixtures for create, conflict review and failed-save handling. Browser fixtures
are not real hosted customer UAT. Full existing CI/Windows/security gates apply.

Reuse: existing #315 RPC, configFromEnv, pgRpc, pgSelectAll, membership authority,
writer generation and roster hydration boundary; existing React and test tools.
No added package or copied upstream source. Supabase changelog and official
Data API security guidance reviewed 2026-10-10: grants and RLS remain separate
required boundaries; current relevant extension upgrade notices do not change
this client-only RPC integration. PostgreSQL remains the portable authority.

Remaining: server UTC/rest activation with historical/cross-branch invariants,
policy approval and recurring batch approval, offline configuration parity,
multi-event recovery, authenticated real customer UAT and a verified installer.
Master Vision remains ~51%; stable Windows remains v1.0.15.
