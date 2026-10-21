# INV-017 — SQLite Kit Reservation Transaction Pilot

**Date:** 21 October 2026 · Built on merged #562 and #560 · Tracker #325

## Implemented

`commerce-kit-sqlite-pilot.ts` implements a **real SQLite BEGIN/COMMIT/ROLLBACK transaction** over **isolated opt-in pilot tables**:

- `initializeKitReservationPilotSqlite(db)` creates `kit_lot_pilot_v1` and `kit_reservation_pilot_v1` only when explicitly invoked. It is **not called by application startup** and is **not a migration**.
- `createKitReservationPilotSqlite(db, request)` reads lot versions and previously persisted idempotency reservations from the actual SQLite transaction, calls the merged FEFO/CAS planner, updates all lot rows with exact old stock and versions, then inserts the uniquely keyed reservation. A matching retry returns no changes.
- `finalizeKitReservationPilotSqlite(db, request)` reads current persisted reservation and locked-scope lots, calls the merged release/fulfill planner, and applies all lot updates and status/version transition in **the same SQLite transaction**.
- Fulfillment requires a synchronous `commitFinancialEvent(db, record)` hook, called within the same transaction. A financial error aborts **both** lot updates and reservation transition. Caller must implement a genuine idempotent authorized financial SQL write; a no-op callback is rejected when it makes no SQLite row changes. This guard does not prove the correctness or idempotency of financial postings.
- The host must provide the `authorizeWarehouse(orgId,warehouseId)` callback from a verified device/tenant authority; renderer-provided callbacks or unverified scope are **not acceptable**. Pilot code does not implement cryptographic authentication.

## Testing and limitations

8 regression groups exercise **actual sql.js SQLite** rather than a mock database: multi-SKU allocation, deterministic retries, release, fulfillment+ledger rollback, mid-plan CAS conflict, scope isolation, shortage/blocked lots, and absence of pilot schema on normal SQLite.

**Not production integration.** These isolated lot rows are **not** the product stock ledger or authoritative warehouse positions. The pilot deliberately has **no feature toggle or UI** and does not run on real business data. Do not enable it until schema and business stock authority converge, multi-process locking is designed, signed device/branch grants are enforced, financial sync/idempotent checkout writes are integrated, and SQLite-to-Electron binary write acknowledgment is verified. In particular, existing sql.js `transaction()` COMMIT plus snapshot export/IPC queue is **not equivalent to confirmed durable disk persistence**.

No new dependency (sql.js already belongs to workspace database), hosted migration, paid provider, deployment, direct real stock deduction, or released installer. No external Aimeos/QUIQQER PHP copied.
