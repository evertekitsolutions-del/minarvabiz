# HR-004 IANA-aware actual-time roster validation

- Base `3a2f0dae13df6525ce03cc0592c12eeca7388bb5`. Uses existing shift/roster engine, `resolveRosterShiftInstants` and JavaScript `Intl`. No third-party code or dependencies and no paid API.
- An opt-in `checkZonedRosterSlot` validates immutable IDs, revisions, staff/branch authority, shift activity and cancellation with the shared engine, then evaluates overlap/minimum rest with actual UTC instants using an explicit branch-specific IANA timezone resolver.
- Spring-forward can shrink actual rest; fall-back can enlarge it. Missing/ambiguous civil times fail closed unless a policy explicitly resolves a fold.
- Checks all relevant staff slots, including slots on other branches (after historical branch transfers), with their respective branch policies; no storage mutation.
- Server-side PostgreSQL roster guard still checks *wall-clock* overlaps, so this **does not** establish complete online DST enforcement. Tenant-owned timezone metadata, versioned policies, server UTC overlap/rest enforcement, Web/Windows policy selection, conflict workflow and authenticated production UAT remain required.
- Full Master Vision estimate remains ~51%.
