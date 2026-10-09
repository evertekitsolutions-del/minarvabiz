# HR-004 recurring roster preview — safe reuse record

- Base: `59a4a8d2d41e087f9190997654675958922d136e`; previous HR-004 PRs #280–#284 already merged.
- Reuses Minarva-native `checkRosterSlot`, `ShiftRule` and `RosterSlot` without external libraries or new recurring expenses.
- Previews ISO-weekday recurring schedules using branch-local calendar dates; rejects duplicate identities, overlaps, rest violations and invalid range/weekday inputs as one atomic plan.
- The function never persists, sends RPC calls or creates customers. Apply/approval workflow, policy controls, IANA timezone/DST instant resolution, browser/Windows UI, online sync/replay and production customer UAT remain mandatory HR-004 work.
- Preview window limited to 366 days per request for bounded processing; subsequent non-overlapping windows remain supported.
- No third-party code, dependency, license or production database migration in this milestone.
