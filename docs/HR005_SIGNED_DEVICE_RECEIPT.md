# HR-005 — Signed Holiday Device Snapshot Receipt (Source Only)

**Status:** Bounded portable security foundation; PR exact-head/post-merge CI and real Cloud/Windows customer UAT remain required.

## Scope

The existing holiday calendar and Windows SQLite v15 snapshot cache are retained. This slice adds a WebCrypto Ed25519 detached-signature verifier in `packages/business-logic/src/holiday-device-receipt.ts`. No dependency, paid API, server deployment, migration, auth flag change, Cloud call or cached snapshot mutation.

The detached signature binds canonical, validated and sorted holiday records to:
- exactly one organization UUID and one device UUID;
- explicit snapshot UUID and monotonic device sequence;
- issued/expires timestamps, bounded to fifteen minutes;
- complete rule identities, branch/country scope, civil dates, versions and active/treatment state.

The verifier refuses unknown/missing trusted context, invalid/untrusted snapshots, duplicate rules, cross-tenant contents, wrong device, sequence replay/downgrade, expired/future packets, malformed signature or incorrect public-key signature. Its only successful output is an independently copied, validated set of rules for **future** authorization. It never calls `hydrateHolidayCache`, writes SQLite/Cloud, modifies an outbox, or sets payroll, attendance or rostering decisions.

## Important trust and rollout boundaries

1. The caller must obtain **the expected organization ID, device ID and last accepted sequence** from independently authenticated, durable device state. The server receipt issuer, device registration, protected sequence persistence and transaction/rollback mechanism are NOT implemented by this source slice.
2. The Ed25519 **public key must come from trusted/pinned configuration**; it must never be accepted from the receipt packet itself. The private signing key must never ship to Windows or the browser.
3. An authorized, transactionally audited server signer with revocation, key rotation, receipt storage, tenant/device RLS, authenticated full snapshot selection and replay protection is a later task. Current verifier cannot grant authorization by itself.
4. Actual Cloud-to-Windows hydration needs an explicit verified receipt/atomic SQLite update, rollback, lifecycle and authenticated customer UAT. No automatic conflict resolution is implied.
5. The HR-005 hosted production migration remains unapproved/unapplied and `NEXT_PUBLIC_HR005_HOLIDAYS_READY` stays OFF. The latest confirmed customer installer remains v1.0.15.

Real Ed25519 regression tests check valid signatures, wrong signer, changed signed contents, expiry, cross-tenant/device identity, stale sequence, invalid receipts, no unauthorized mutation and shared-core export. Test source: `packages/business-logic/src/__tests__/holiday-device-receipt.test.mjs`.

**Full Master Vision remains ~51% until broader product acceptance.**
