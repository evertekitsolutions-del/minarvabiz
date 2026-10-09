# HR-004 workforce sync session revocation guard

Baseline main: `ecfc7c442765ed79ad0aba2865c9313a288367a4`.

- Root cause: `flushWorkforceRosterOutbox` captured the cloud writer once and could continue sending subsequent queued workforce events and mark an in-flight RPC response synced after a session/tenant transition.
- `registerRemoteWriter` now increments a generation on every writer replacement/revocation. The domain flush checks both the captured generation and the exact writer identity **before and after each await** and rechecks `staff.manage` permissions.
- If logout/role change occurs mid-RPC, keep the original immutable outbox event with a failed diagnostic; all subsequent events stay pending. A later explicitly authorized retry replays the same event IDs via the existing audited/idempotent PostgreSQL RPC; no silent acknowledgement or unsafe tenant replay.
- Adds actual asynchronous revocation/relogin regression assertions to the existing domain test. No schema migration, recurring service, package addition or production customer data change.
- This does **not** authorize Web editing, auto-resolve roster conflicts, prove production UAT or finish HR-004. Full Master Vision remains approximately 51%.
