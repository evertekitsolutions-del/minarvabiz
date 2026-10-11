# HR-005J — Signed Device Holiday Intake Reconciliation Preflight

**Source-only, read-only; no authorized Windows/Cloud hydration.**

This bounded milestone connects the merged Ed25519 holiday device receipt verification (PR #343) with existing Cloud-vs-Offline rule revision comparison (PR #340), without duplicating either engine. The `holidayDeviceReceipt.reviewSignedHolidayIntake` function:

1. Verifies a domain-separated Ed25519 signature against caller-supplied **trusted pinned server key**, matching expected organization/device, bounded validity and a sequence strictly newer than protected last-accepted value. Invalid inputs reject before comparison.
2. Reuses `reviewHolidayRevisionSnapshots` to validate full local/receipt arrays, reject duplicate/corrupt/foreign-tenant rules and classify newer, same-version-divergent and one-sided records.
3. Returns human-review discrepancies and an explicit **`canHydrate: false`** value/type even for identical snapshots. Empty signed remote arrays do not grant deletion authority over offline records.

No changes to SQLite, live cache, outbox, Cloud API, payroll, attendance, roster, auth/feature gates, production database or installer. This is not authenticated Cloud-to-Windows transfer authority: a real audited server signer, enrolled device identity, protected monotonic receipt ledger, key rotation/revocation, atomic SQLite apply/rollback and local dirty-state conflict decisions remain necessary, plus real Web/Windows/Hybrid UAT.

Tests use real Ed25519 signatures and cover identical, same-version divergence, Cloud/local newer, missing records, empty remote packet, tamper, replay, expiry, device/tenant mismatch, untrusted key, malformed local records, input immutability and no cache hydration. Regression suite: `packages/business-logic/src/__tests__/holiday-device-receipt.test.mjs`.

HR-005 production migration NOT deployed; `NEXT_PUBLIC_HR005_HOLIDAYS_READY` stays OFF. Customer Windows installer v1.0.15; full Master Vision ~51%. No added paid services.
