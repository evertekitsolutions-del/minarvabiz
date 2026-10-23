# SVC-013 (Master Registry) — Offline Technician Route Planning

This capability is **manually sequenced technician/day service visit stops**
within Services → Field service site visits. It is distinct from
SVC-014 Job Profitability (the earlier SVC-013-named code milestone, PR #614,
which implemented the profitability range but was mislabeled).

Staff with \`orders.assign\` may assign numbers 1–100, or clear an existing
number, for visits in the currently active branch while scheduled/arrived.
Numbers cannot duplicate another active visit for the same staff member and
scheduled calendar day. Records use existing Windows Offline SQLite snapshot
storage, branch/order/staff validation, optimistic version checks, audit log,
autosave, and backup/restore. Historical rows without routeSequence remain
fully compatible. Once completed/cancelled, visits cannot be resequenced.

A read-only technician/day worksheet shows numbered first, followed by
unsequenced stops, with explicit buttons to open individual customer addresses
or up to eight stops in Google Maps driving directions (a longer route opens
the first eight ONLY). CSV export includes the full worksheet with
spreadsheet-formula escaping.

**Privacy:** Google receives the selected customer addresses ONLY after an
operator presses the Maps button. Staff should have authority to share site
addresses. No background customer data transmission, GPS tracking, automated
geocoding, routing optimization, map billing, odometer, distance/ETA guarantee,
customer notification, subscription or paid infrastructure.

The route does not silently alter technician assignment, inventory, invoices,
GL posting, work order financial status, or service completion timestamps.
Live production Web remains read-only, and customer installer v1.0.15 is not
changed.

Tests: packages/business-logic/src/__tests__/service-visit-route-planner.test.mjs
and packages/business-logic/src/__tests__/service-site-visit-register.test.mjs.
Require CI typechecking, Web/Desktop build, safety scans, core coverage,
Windows deep installed and feature click smoke, postmerge main, then real
customer UAT before a signed installer release.
