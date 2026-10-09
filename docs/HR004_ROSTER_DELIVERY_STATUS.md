# HR-004 Shift/Roster — Delivery and Remaining Acceptance

**Status:** Partial implementation; not production-complete  
**Verified baseline:** main `f2fc468728172b20588de10e548a430165f71dd6`, merged PR #302  
**Updated:** 2026-10-09  
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

The exact-head #299, #301 and #302 merge gates each concluded with **19 success, 2 optional skipped, 0 failure**, including CI, SAST, dependency/license, secrets, coverage, Web, Windows packaged/feature-click/deep installed smoke. An initial test-code syntax defect was corrected before green exact-head validation.

## Important limits — do not misreport as complete

1. **Web pending queue durability:** new Web roster events survive the current browser session only. `beforeunload` warns but does not guarantee recovery after a crashed/closed tab, browser restart or device switch. Windows SQLite v14 snapshot/backup remains separate.
2. **Conflict reconciliation:** reviewed **Keep Cloud** and **Reapply Local** are implemented for one isolated same-canonical-ID event. Reapply Local re-fetches the current revision and creates a NEW immutable event under the existing audited RPC. Cross-device conflicting staff/day creations with **different IDs**, multi-event dependency recovery, and durable browser crash recovery remain incomplete. No silent last-write-wins.
3. **Timezone/DST:** shared `checkZonedRosterSlot` resolves actual UTC instants with explicit branch IANA rules. PostgreSQL trigger currently validates wall-clock overlap and does not yet provide tenant-owned branch timezone/DST branch-policy enforcement or UTC minimum-rest on the server.
4. **Minimum rest and labor policy:** current local planner numeric minimum-rest input is not a centrally versioned approved organizational policy. A server-authoritative configurable rest policy, statutory pack integration and migration-safe history remain outstanding.
5. **Recurring rosters:** weekly/monthly previews exist. Manager review, approval/rejection, atomic batch submit, conflict analysis, timezone checks, approvals audit and server rollback semantics are not complete.
6. **Production verification:** no named legitimate customer manager/cashier authenticated production UAT was executed. Read-only Supabase metadata verifies installed tables/RLS/FORCE and an authenticated-only RPC. These checks do not prove a real role-restricted mutation or customer data readiness.
7. **Installed Windows customer release:** source CI smoke is not a released customer setup file. Last confirmed stable installer is v1.0.15 until live release assets, checksum, updater and installation acceptance prove otherwise.
8. **Full Master Vision:** approximately **51% estimate**, not HR-004 percentage and not a measured claim that payroll, holidays, leave, online stores, manufacturing, country packs or AI are complete.

## Required next engineering slices

- HR-004A (partially complete): one-event same-ID **Reapply Local** reviewed, audited and exact-head verified in #301. Next extend canonical different-ID same-staff/day identity review and ordered dependent-event recovery; never discard third-party changes or bypass tenant authority.
- HR-004B: durable, tenant-partitioned Web pending HR outbox compatible with portability/privacy policy; test restart, auth swap, logout, corruption, interrupted update and recovery with no credential exposure.
- HR-004C: tenant-owned IANA timezone and DST fold/gap policy + centrally approved minimum rest; additive PostgreSQL migration with authorization, server enforced UTC overlap/rest and cross-branch historic shifts; reproducible PostgreSQL E2E.
- HR-004D: shift templates and recurring roster approvals including review, versioned policy, audit, batch atomicity, correction/cancellation and explicit conflicts.
- HR-004E: browser and **real installed** Windows UI feature UAT, further customer-grade native SQLite/backup disaster recovery (engine-level regression is verified in #302), PostgreSQL production integration and legitimate authenticated customer UAT; separately verify new signed installer and updater. No synthetic customer production fixtures.
- Then continue HR-005 Holidays, HR-006 Leave, HR-008 Late/Early, HR-009 Break, Payroll and Employee Self-Service per authoritative Master Plan.

## Engineering invariants

All writes pass shared `staff.manage` authorization and existing server organization-membership checks; browser never holds service-role keys. Event receipt, optimistic revision, tenant RLS and audit history cannot be bypassed. Do not treat CI success alone as live production UAT. Preserve all Master Vision modules, existing paid-service freeze until the ~25-customer review checkpoint, and provider-neutral PostgreSQL/S3/self-host AI portability.

**Continuation:** Verify live `main`, PRs/issues/workflows first; read `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, engineering/review governance and this file before changing HR-004 again.
