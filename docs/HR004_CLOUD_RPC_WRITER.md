# HR-004 authenticated workforce RPC writer and sequential confirmation

- Baseline merged #290 main `a2cd8db4c6b2336f627da480831e073596fd8716`.
- Reuses the existing `@minarvabiz/sync` PostgreSQL `apply_staff_roster_event` adapter, authoritative RLS/RPC, immutable outbox. No third-party dependencies, production schema changes, paid options or fake customer UAT.
- Registered only after authenticated roster hydration (or on subsequent domains when already hydrated). Explicitly rejects absent access token, malformed events and missing/mismatched original-event acknowledgement.
- Domain `flushWorkforceRosterOutbox` serializes pending/failed shift + roster events in original sequence. After each exact RPC confirmation it marks only that event synced; errors retain pending history with diagnostic and stop further delivery, including dependent slots.
- Existing local mutations are **not automatically sent** or shown as remote success. Web planner editing remains disabled until tenant-specific origin/revision UI, conflict review/rebase and safe browser retry are integrated.
- Production HR-004 customer UAT, recurring bulk approval, versioned branch IANA/DST enforcement, statutory rest/payroll policy and tested Windows release remain unverified; full Master Vision ~51%.
