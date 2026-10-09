# HR-004 authenticated Web roster read path — 2026-10-09

- Base main: `67d22241378009c2d3ed77af800620d22689f2c7`. Existing PRs #280–#289 preserved; no restart.
- Added a distinct `roster` lazy cloud hydration domain and tenant-scoped Web planner route. Reads `staff_shift_rules` and `staff_roster_slots` using the authenticated user's publishable-key PostgREST session and existing FORCE RLS manager SELECT policies.
- Reuses shared `RosterPlanner`, `phase6Store` snapshot validator, immutable roster outbox, existing branch/staff auth. No new runtime dependency, paid API, production migration, or service-role secret. Web UI renders only once the roster+staff hydration has succeeded, not stale last-session records.
- Fails closed if any local workforce event is still pending/failed; nothing is silently replaced on cloud reload or tenant switch. Existing Windows SQLite planner remains writable and unchanged.
- Web roster is **read-only** until remote RPC writer registration, revision sequencing, explicit conflict reconciliation and cross-tenant session guard are complete; no Online/Hybrid parity claim. UI clearly discloses this.
- Outstanding mandatory HR-004: authenticated writes, manual conflict resolution, policy-owned timezone/DST selection and server enforcement, recurring bulk approval, installed Windows roster feature UAT, and authorized real production customer UAT. Full Master Vision stays approximately 51%.
