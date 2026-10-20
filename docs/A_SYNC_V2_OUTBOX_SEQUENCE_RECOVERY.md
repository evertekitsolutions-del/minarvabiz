# A-SYNC-V2 — Outbox snapshot sequence authority

- Rebased original PR #527 against current main without touching financial replay contracts.
- Preflight restored event sequence bounds before replacing the pending outbox. Failed sequence-exhaustion restores preserve the previous queue and its unsynced audit records.
- Avoid spread argument limits in both next-sequence calculation and large-queue copy; O(n) traversal.
- Keep malformed historical numeric sequence fields unchanged for diagnostics, while deriving a valid next sequence only from safe positive integer candidates.
- Reject enqueue after MAX_SAFE_INTEGER rather than minting an imprecise/reused sequence.
- Executable Node `.test.mjs` scenarios cover corrupt fields, 150k events, failed-restore atomicity and overflow.
- Does not authorize cloud financial writes or change server sequence authority. No production migrations, data writes, paid infra or installer release.
- Installer customer acceptance and cross-device sync reconciliation remain outstanding.
