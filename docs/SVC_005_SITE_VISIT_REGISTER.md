# SVC-005 — Site visit lifecycle, Windows Offline

Milestone: manual field service register in **Services & Orders → Field service site visits**.

Customer work order → assignment to an active technician → schedule a visit on a
valid calendar day with mandatory site address → mark actual on-site arrival
→ finish visit. Cancellation from scheduled state requires a reason.
Each transition retains order/customer/branch/technician identity, optimistic
revision checks and an existing audit log entry. A completed/cancelled visit
cannot be reopened or repeated; no duplicate scheduled visit for the same
assignment and day.

This **records staff-confirmed timestamps**; it does not establish GPS presence,
biometric attendance, customer signature, photo evidence, invoicing, SLA,
stock/spares, field technician PWA access or automatic messages. Existing order
assignment, financial, WhatsApp, warranty and status logic are unchanged.

Production Web is **read-only**. Site visit create/transition operations are
Windows Offline-only until tenant-safe cloud persistence and sync exist.
Historical backup snapshots without a site visit field still import.
Malformed site visits (duplicate identity/date, invalid lifecycle/timestamps,
unknown fields, unsafe strings) fail validation before state replacement; the
existing snapshot rollback path is preserved. No migration, production write,
new recurring paid dependency or installer publication.

Testing:
\`node --test packages/business-logic/src/__tests__/service-site-visit-register.test.mjs\`
plus business logic/UI typechecks, exact-head mandatory GitHub CI, Windows
installed smoke, and post-merge main checks. Before customer acceptance,
run a real installed Windows offline booking→arrival→completion→backup restore
journey and verify multi-device Online/Hybrid parity separately.
