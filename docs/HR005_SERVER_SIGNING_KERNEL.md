# HR-005K — Server-Only Ed25519 Holiday Receipt Signing Kernel

**Source milestone. Not connected to any HTTP endpoint or enabled production service.**

This implementation adds `apps/web/src/lib/hr005-holiday-receipt-signing.server.ts` with a server-only import boundary. It reuses the exact **already merged shared** canonical signing bytes (`holidayDeviceReceipt.holidayDeviceSnapshotSigningBytes`) consumed by Windows/Web verification. The signer accepts only an in-memory Ed25519 private `KeyObject`, a separately pinned 32-byte verifier key, a trusted server clock, and one bounded validated snapshot.

The signer:
- Refuses non-Ed25519/private keys, missing/incorrect pinned verifier keys, invalid server clocks and malformed/foreign-tenant/duplicate rules.
- Derives the actual public key from the private key and compares it using timing-safe equality with an independently supplied pinned verifier key, rejecting key mismatches rather than generating receipts a Windows device cannot verify.
- Uses the existing domain-separated, sorted canonical payload encoding; strips ignored/untrusted extra fields in the returned payload; outputs a detached Ed25519 signature compatible with the existing signed-device validator.
- Never reads an environment secret itself, makes a network request, accesses production data, issues a device identity, increments/persists a sequence, writes an audit record or grants client hydration.

**Crucial: this is not an authenticated server-side receipt issuer.** Before any HTTP route or production use, a separately reviewed authorization adapter MUST authenticate a live actor/session, verify tenant/device RLS and registration, ensure the complete authoritative holiday snapshot and key revocation/rotation, allocate and persist monotonic device sequence transactionally with a durable audited issuance record, enforce request rate limits, and handle key distribution. Never accept caller-supplied arbitrary private keys, verification key, scope or clocks at that boundary. Protect and rotate the signing private key using an approved server-owned secret manager. Never make it available in client JavaScript, logs, Windows install, browser environment variables, GitHub repository or analytics.

Windows still must independently verify and persist the receipt, reconcile existing unsynced local changes, atomically commit SQLite changes and sequence with rollback and customer UAT. `canHydrate:false` remains the only review outcome from PR #347; signature alone is NOT an authorization or deletion instruction.

Regression test `packages/business-logic/src/__tests__/holiday-server-receipt-signing.test.mjs` generates a real Ed25519 key, proves that the new signer produces receipts accepted by the existing WebCrypto device verifier, verifies canonical normalization and tenant/date/sequence binding, and rejects wrong/malformed key, malformed or cross-tenant snapshots, stale clock and signature tampering. It runs in the existing business-logic CI test sweep and requires no new dependency or paid service.

HR-005 hosted migration remains unapproved and unapplied; `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF. Latest confirmed customer Windows installer v1.0.15. Full Master Vision ~51% until end-to-end customer acceptance.
