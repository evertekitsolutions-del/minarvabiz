# HR-004 shared workforce planner — Windows offline navigation

- Baseline merged `30661401a20c5f482ad5086868584f3d7c206006`; #285 preview engine, #286 cloud outbox adapter, #287 revision parity already merged and preserved.
- Added a React shared `RosterPlanner` component for shift templates, overnight times, branch restrictions, employee assignments, corrections/cancellations, reviewed ISO-weekday monthly preview, and revision display.
- Embedded via Windows Staff Management → Open Shift & Roster Planner. Callbacks enforce `staff.manage` at domain layer, then await strict SQLite persistence; errors remain visible and recoverable. No online-only or paid dependencies.
- Monthly recurrence is **preview only**; no silently partial batch apply. Single shift assignment writes use existing audited domain/outbox and SQLite snapshot schema v14. No new production database migration.
- Web client roster edit is NOT enabled until authenticated app-level hydration/writer, proper conflict resolution and tenant identity isolation are verified; never infer online parity from shared component availability.
- Branch-local wall-time only; IANA timezone/DST and statutory rules are still an HR-004 gate. Installer source CI is not proof of a new published Windows installer.
- New UI must still undergo dedicated *feature-level* installed app UAT; general Windows smoke passes do not prove every roster control. Full Master Vision remains ~51%.
