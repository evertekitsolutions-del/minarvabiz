# HR-005 — Server-Signed Holiday Snapshot Receipt Preflight (Source Only)

**Delivery boundary:** cryptographic verification primitive, not a running sync service or customer rollout.

This feature builds on merged HR-005 Windows SQLite v15 snapshot and Cloud/Offline revision/calendar reviews. It uses browser/Node/Electron native WebCrypto with no paid provider or third-party crypto dependency.

## Implemented
- Deterministic complete snapshot SHA-256 over the already validated and canonically ordered holiday rules (at most 5000 rows, duplicate/foreign organization rejection).
- Domain-separated canonical receipt bytes: version, organization, device, unique receipt ID, precise issued/expiry UTC timestamps and complete snapshot hash.
- ECDSA P-256/SHA-256 64-byte raw signature verification, requiring an independently pinned **trusted server public CryptoKey**; wrong keys, signatures or algorithms fail closed.
- Exact tenant and device identity checks; expiry/future issuance checks with maximum 15-minute receipt lifetime.
- Reject a consumed receipt identity using an independently supplied receipt ledger. This module **does not** persist/consume the receipt. Durable server/device replay protection and atomic import are separate requirements.
- Regression tests cover valid cryptography, altered receipt/holiday data, duplicate/foreign tenant rows, device mismatch, consumed IDs, expiry, replay and immutable input.
- No holiday cache hydration, PostgreSQL RPC, SQLite write, outbox action, Cloud update, automatic holiday treatment or payroll action.

## Critical remaining delivery (NOT implemented)
1. Server-side authenticated manager session, full tenant-RLS snapshot boundary, signing authority with key management/rotation and secure audit/receipt issuance; approved public key distribution through trusted infrastructure.
2. Device enrollment, independently authenticated organization/device identities, durable nonce consumption and authoritative replay/audit ledger; clock and key-rotation security.
3. Atomic, reversible Windows SQLite ingestion gated on reviewed conflicts, prior local revision state, signed receipt verification and explicitly authorized user decision; Offline/Hybrid concurrency and rollback tests.
4. Real signed message transport with retry, idempotency and crash/restore evidence; UI and customer UAT, first deployment safety approval.
5. Hosted HR-005 migration remains unapplied, NEXT_PUBLIC_HR005_HOLIDAYS_READY OFF. No payroll/leave/legal policy assumed. No production migration or release in this milestone.

**Never trust a key supplied by the same untrusted snapshot.** The verifier checks a pinned key passed by its caller; that caller, identity and consumed-receipt ledger are not implemented here. Neither receipt verification nor SHA-256 alone authorizes a hydration/write.

Full Master Vision remains ~51%; stable customer Windows installer v1.0.15.
