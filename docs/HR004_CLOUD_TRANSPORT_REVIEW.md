# HR-004 portable cloud roster transport — 2026-10-09

- Baseline merged PR #285 `bc78e5c76a8ce1a16d1ee98e629d264e218fcd51`. The prior PostgreSQL roster schema and authenticated atomic event authority were merged by #282/#283 and applied to production before this milestone.
- Adds `staff_shift_rules` and `staff_roster_slots` to the existing cloud pull table list with PostgreSQL tenant RLS unchanged.
- Workforce outbox writes dispatch exclusively to `apply_staff_roster_event` with original immutable record, event ID, device ID and sequence. Never attempt direct DML, silent fallback, generic outbox acknowledgement or destructive hard delete.
- Fail closed on RPC permission/transport failure, optimistic conflict, malformed event, wrong acknowledgement ID or an earlier failed revision. A dependent roster assignment cannot pass an unacknowledged shift-template update in the same push batch.
- Reuses the existing portable `PgClient` / `CloudAdapter` and domain outbox APIs. No third-party code, runtime dependency, paid service or production migration.
- Deterministic adapter unit tests use isolated mocked RPCs, NOT synthetic production tenants or fake live UAT.
- Remaining scope: authenticated app-level writer registration, browser hydration with pending-event tenant isolation, shared Web/Windows planner and edit screens, recurring plan commit/approval, manual conflict resolution, branch IANA timezones/DST policy, Windows customer release and real authorized production Online/Hybrid UAT.
- Full Master Vision stays around 51%; this is an incremental integration milestone, not full HR-004 delivery.
