# HR-005 — Online vs Offline Holiday Rule Revision Review

**Status:** Source-only, pending exact-head CI / merge and real authenticated UAT.

## Reuse and behavior

Uses Minarva Biz's own validated holiday cache (Windows SQLite domain snapshot v15), shared holiday domain rules and feature-flagged Web manager with fresh RLS-scoped Cloud read. No external libraries, new API, paid inference service or managed provider are required.

The read-only preview:
- refuses malformed/duplicate/foreign-organization holiday records on BOTH sides before comparing;
- rejects a stale/changed auth session at the online client layer and refuses an organization mismatch;
- compares the entire explicit identity and payload, including historical date, scope, branch, recurring flag, name, treatment and activity;
- reports identical rows, Cloud-newer, local-newer, equal-version divergence, local-only and Cloud-only rows deterministically;
- **never** interprets a missing Cloud record as permission to erase an Offline original, or a newer Offline version as permission to replay;
- only displays to existing `staff.manage` managers, with a new fresh authorized Cloud read for every comparison;
- does **not** call a write RPC, queue new outbox events, hydrate local cache or alter roster, payroll, attendance, backup or audit history.

## Deferred safety authority

This milestone **does not** claim cross-device transactional sync, authenticated Windows customer UAT or automatic reconciliation. Those need audited PostgreSQL transaction receipts, durable encrypted event history, tenant/device identity and fail-closed conflict authority before actual writes can be added.

Production migration `20261011_hr005_holiday_rules.sql` remains source-only, NOT deployed. `NEXT_PUBLIC_HR005_HOLIDAYS_READY` remains OFF absent separate verified rollout and customer approval. Full Master Vision ~51%, latest stable customer installer v1.0.15.

## Test scenarios

- exact same snapshots; newer Cloud/Offline revisions; same-version payload divergence; rows appearing only on one side;
- duplicate/foreign tenant IDs, invalid dates/versions/branch UUID;
- empty local/Cloud data, immutable inputs and no hidden writes;
- Web/UI contract explicitly requires fresh authenticated read and privileged local cache read;
- full Windows, Web, security and release checks plus actual customer UAT remain required.
