# HR-004 Shift/Roster — Delivery and Remaining Acceptance

**Status:** Partial implementation; not production-complete  
**Verified baseline:** main `7c8695bf5d541d163e008892659967d45d9f8fd1`, merged PR #299  
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

The exact-head #299 merge gate concluded with **19 success, 2 optional skipped, 0 failure**, including CI, SAST, dependency/license, secrets, coverage, Web, Windows packaged/feature-click/deep installed smoke. An initial test-code syntax defect was corrected before green exact-head validation.

## Important limits — do not misreport as complete

1. **Web pending queue durability:** new Web roster events survive the current browser session only. `beforeunload` warns but does not guarantee recovery after a crashed/closed tab, browser restart or device switch. Windows SQLite v14 snapshot/backup remains separate.
2. **Conflict reconciliation:** review and **Keep Cloud** are implemented for a safely isolated reviewed event. **Reapply Local** requires a fresh approved remote revision, durable supersession of the original queued event, dependent event sequencing, canonical identity resolution and audit. Do not auto-discard, auto-rebase or last-write-win.
3. **Timezone/DST:** shared `checkZonedRosterSlot` resolves actual UTC instants with explicit branch IANA rules. PostgreSQL trigger currently validates wall-clock overlap and does not yet provide tenant-owned branch timezone/DST branch-policy enforcement or UTC minimum-rest on the server.
4. **Minimum rest and labor policy:** current local planner numeric minimum-rest input is not a centrally versioned approved organizational policy. A server-authoritative configurable rest policy, statutory pack integration and migration-safe history remain outstanding.
5. **Recurring rosters:** weekly/monthly previews exist. Manager review, approval/rejection, atomic batch submit, conflict analysis, timezone checks, approvals audit and server rollback semantics are not complete.
6. **Production verification:** no named legitimate customer manager/cashier authenticated production UAT was executed. Read-only Supabase metadata verifies installed tables/RLS/FORCE and an authenticated-only RPC. These checks do not prove a real role-restricted mutation or customer data readiness.
7. **Installed Windows customer release:** source CI smoke is not a released customer setup file. Last confirmed stable installer is v1.0.15 until live release assets, checksum, updater and installation acceptance prove otherwise.
8. **Full Master Vision:** approximately **51% estimate**, not HR-004 percentage and not a measured claim that payroll, holidays, leave, online stores, manufacturing, country packs or AI are complete.

## Required next engineering slices

- HR-004A: complete **Reapply Local** reconciliation for shift and slot corrections: explicit reviewed user decision, immutable fresh local/Cloud snapshots, stable tenant and event identity, monotonic version rebase, preflight of historic dependencies, atomic outbox supersession, secure replay and CI fault injection. Separate canonical different-ID same-staff/day conflict workflow.
- HR-004B: durable, tenant-partitioned Web pending HR outbox compatible with portability/privacy policy; test restart, auth swap, logout, corruption, interrupted update and recovery with no credential exposure.
- HR-004C: tenant-owned IANA timezone and DST fold/gap policy + centrally approved minimum rest; additive PostgreSQL migration with authorization, server enforced UTC overlap/rest and cross-branch historic shifts; reproducible PostgreSQL E2E.
- HR-004D: shift templates and recurring roster approvals including review, versioned policy, audit, batch atomicity, correction/cancellation and explicit conflicts.
- HR-004E: browser and **real installed** Windows UI feature UAT, SQLite backup/restore disaster recovery, PostgreSQL production integration and legitimate authenticated customer UAT; separately verify new signed installer and updater. No synthetic customer production fixtures.
- Then continue HR-005 Holidays, HR-006 Leave, HR-008 Late/Early, HR-009 Break, Payroll and Employee Self-Service per authoritative Master Plan.

## Engineering invariants

All writes pass shared `staff.manage` authorization and existing server organization-membership checks; browser never holds service-role keys. Event receipt, optimistic revision, tenant RLS and audit history cannot be bypassed. Do not treat CI success alone as live production UAT. Preserve all Master Vision modules, existing paid-service freeze until the ~25-customer review checkpoint, and provider-neutral PostgreSQL/S3/self-host AI portability.

**Continuation:** Verify live `main`, PRs/issues/workflows first; read `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, engineering/review governance and this file before changing HR-004 again.
