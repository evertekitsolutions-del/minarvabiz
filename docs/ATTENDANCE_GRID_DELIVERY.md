# Attendance Grid continuation and acceptance

Date: 2026-10-08. Capability: HR-002, with correction metadata for HR-007/HR-009/HR-010. This is not completion of payroll, rosters, biometric integration or all HR scope.

## Live baseline

- Main `27bed7c3a44a4643653c7e3ae0fc86b4f0856bdd` contains Attendance via merged PR #273, head `cb826200fa1af98b87488ac90cc149ed6cf0dfd1`.
- All 13 deterministic head workflows succeeded; optional Claude review was skipped. PR #274 was closed without merging and must not be reopened as a second implementation.
- The initial grid did not load attendance from PostgreSQL, register it in the cloud adapter pull, preserve correction metadata on status changes, or enforce HR manager roles at the attendance server boundary.
- Production read-only inspection found `public.staff_attendance` absent. A repository merge alone is not a live-feature proof.

## Correction milestone

`fix/attendance-cloud-parity` preserves the merged grid and completes the missing cloud authority, correction UI and transport behavior.

- Shared Web/Windows grid, including holiday totals and clock/break/overtime/notes editor.
- Date/status/time/minute validation before mutation; status-only correction preserves existing metadata.
- Immutable versioned outbox events, ordered flush, explicit retry and original event identity.
- Layout/page hydration serialized to prevent two concurrent initial loads from overwriting a later correction; attendance is a separate route hydration domain, so an unapplied attendance schema does not break legacy staff/dashboard hydration.
- Authenticated browser calls a PostgreSQL-compatible atomic attendance RPC. No service-role credential enters a browser.
- RPC derives tenant and authoritative role from organization membership, validates staff/branch ownership, serializes staff/day and event identities, checks optimistic versions, and commits attendance, private replay receipt and audit together.
- A conflicting staff/day returns its canonical remote identity and version. Explicit human choice can retain cloud state or submit the local correction against that version. HR conflicts never use automatic last-write-wins.
- Direct attendance DML is revoked from authenticated clients; attendance reads require admin/manager authority. Private replay receipts are inaccessible to anon/authenticated.
- No paid dependency, new runtime package or provider lock-in was introduced.

## Reuse review

Reused Minarva-native grid, modal, permissions, persistence snapshot v13, outbox, authoritative organization RBAC and PostgREST clients. No third-party source copied and no license obligations added. Official references reviewed:

- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://supabase.com/docs/guides/database/functions

Attendance's authority is PostgreSQL-compatible. Desktop persistence remains SQLite-backed snapshot v13; pending events survive desktop backup/restore. Data export is available through snapshots/database backups. Private replay receipts contain HR personal data and must inherit the organization's retention/access/backup controls. AI-HR anomaly suggestions remain read-only future scope; no autonomous payroll or employment action was added.

## Verification and rollout gates

1. Runtime tests reproduce and prevent metadata loss, malformed inputs, unauthorized access, mutable queued payloads, concurrent hydration and retry identity changes.
2. Transport tests exercise atomic RPC use, remote row mapping, fail-closed transport failures and manual conflict policy.
3. Shared UI checks verify real rendered day/editor controls and calendar boundaries.
4. The isolated Supabase workflow replays all migrations and runs `scripts/attendance-authority-e2e.sql`, proving actual PostgreSQL tenant/role isolation, staff/branch ownership, no direct-DML bypass, replay identity, stale version rejection and atomic audit receipts. Fixtures roll back; never run this script against production.
5. Require exact-head CI, coverage, security/license/secret, Windows and fresh-instance workflows green before merge.
6. After merge, apply the existing `20261008_attendance_grid.sql` and additive `20261008141024_attendance_event_authority.sql` together to production. Do not apply only the older membership-write policy and leave it live.
7. Verify production grants/policies/RPC presence and safe read-only HTTP behavior. Authenticated user UI UAT and a new Windows installer are separate release acceptance evidence; v1.0.15 does not contain these new Attendance changes.

## Honest limits

Browser production snapshots are intentionally not stored in localStorage by the existing platform. Pending web changes remain in the current session until uploaded; the UI must expose upload errors and retry, and must not claim durable browser-offline delivery. Desktop has SQLite persistence. Wiring the generic cloud adapter is transport coverage, not proof of a production desktop cloud session. Full Hybrid Sync v2 remains an explicit master-plan milestone.

The full MASTER VISION baseline supplied by the user is approximately 50%. Do not derive a new percentage from passing checks or assume that Attendance's one registry row equals one full percentage point. Increase the full-project estimate only after delivered scope, required merge and appropriate runtime/release evidence are reconciled.
