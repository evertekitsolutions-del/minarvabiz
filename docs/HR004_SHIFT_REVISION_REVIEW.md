# HR-004 shift rule revision parity — 2026-10-09

- Baseline merge `e6a99ab8974c3922e0c7973c050e67cfab8add2b`. HR roster RPC requires `p_record.version` for both first insert (1) and each optimistic increment. Local `ShiftRule` lacked a persisted version, so the new RPC cloud adapter could not actually post ordinary shift creation/update events.
- Added optional version to shared `ShiftRule` for legacy compatibility. New templates always set version=1; local updates increment it, forbid caller-supplied revisions and IDs, and enqueue immutable updated payloads. Validation rejects non-positive and fractional revisions.
- Older v14 snapshots without shift versions normalize to version=1 during hydration; v13 snapshots remain compatible. Import validation/rollback and outbox histories remain intact.
- Existing PostgreSQL server revision guards remain authoritative; no SQL schema changes, no fake production tenants or paid resources.
- Limitation: pre-fix pending events without revision cannot be silently rewritten (immutable event identity). Expose such failures for manual safe reconciliation during upcoming app-level cloud rollout.
- HR-004 is still incomplete without authenticated app-level writer registration, conflict UI, roster Web/Windows planning, country timezones/DST and customer production UAT. Full Master Vision remains around 51%.
