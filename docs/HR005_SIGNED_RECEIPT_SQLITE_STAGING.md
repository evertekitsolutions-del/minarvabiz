# HR-005L — Durable SQLite Staging of Signed Holiday Receipts

**This is a guarded source milestone, not live synchronization or a deployed customer migration.**

`apps/desktop/src/lib/hr005-signed-receipt-staging.ts` builds on existing shared Ed25519 device verification (PR #343), protected read-only reconciliation (PR #347) and server signing primitive (PR #348).

An independently authorized host can supply a registered tenant/device, trusted pinned server key, trusted clock and **separately persisted last APPLIED sequence**. The function verifies the complete signature before any SQLite work. Within a single SQLite transaction it creates a bounded append-only receipt metadata ledger and checks the current maximum staged sequence again, rejecting replay, downgrade, duplicate snapshot UUIDs and changed tenant/device identity. A valid new signed packet stages its metadata and SHA-256 fingerprint, NOT holiday rule bodies. On disk/transaction errors SQLite rolls back. There is no eviction of unacknowledged records.

**Explicitly never executed by existing Windows bootstrap/UI.** Staging does not overwrite `domain_snapshot_v2` or the v15 holiday cache, use the outbox, change staff roster/attendance/payroll, mark a receipt consumed, accept remote deletions, advance the last APPLIED sequence or authorize hydration (`canHydrate:false` always). The table is a **source-only schema prototype**, not wired into the Windows release/migration. The database's own transaction cannot guarantee native IPC write success or cross-window single-writer locking; those need a reviewed system-level commit protocol.

Critical prerequisites for production: independently authenticated device registration/revocation and tenant authority, real server audited issuance with monotonic sequence in its own DB, key rotation, verified Cloud snapshot scope/completeness, a native Windows single-writer lock, crash-safe atomic *device file* checkpoint/receipt sequence and local cache commit, offline dirty-state conflict resolution, retention protocol and real Windows/Hybrid UAT. Never run this on customer data as presently implemented.

Regression: `packages/business-logic/src/__tests__/holiday-signed-receipt-staging.test.mjs` uses a real sql.js SQLite engine, generates real Ed25519 signatures, persists/reopens a SQLite file, checks durable replay rejection, duplicate UUID, cross-tenant/device rejection, append-only triggers, failed transaction rollback and absence of holiday cache mutations. No paid provider or new npm dependency.

HR005 production SQL migration remains unapplied, `NEXT_PUBLIC_HR005_HOLIDAYS_READY` is OFF, last customer installer v1.0.15, Full Master Vision ~51%.
