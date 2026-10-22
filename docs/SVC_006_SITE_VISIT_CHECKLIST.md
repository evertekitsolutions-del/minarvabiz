# SVC-006 — Real field-service checklist in site visits

**Implementation scope:** Windows Offline service visit checklist stored directly
in each SVC-005 visit record, with existing validated SQLite domain snapshot
backup/restore (no new table or paid dependency).

New scheduled visits carry four mandatory shop-level inspection items: site
power/safety, equipment/cabling, functional operation and handover outcome.
After technician arrival an authorized staff member may record **Passed**,
**Failed**, **Not applicable** (reason required), or reset to **Pending**, with
optional evidence notes. Each change uses visit revision compare-and-swap and
retains an audit event; duplicate submits are refused by stale revision.

A visit **cannot be completed** while a mandatory item is pending or failed;
the staff member must recheck it or record a justified exception. Completed and
cancelled visits are immutable. Existing historical visits without a checklist
remain readable and their preexisting lifecycle is preserved; active legacy
arrived visits can explicitly start a checklist.

The checklist uses existing \`orders.assign\` authorization, active-branch,
order and technician checks. Production Web is read-only until hosted
tenant-safe persistence and Sync v2 authority exist. No customer messages,
photographs, GPS presence claims, stock/GL posting, device certificates or
automated warranty entitlement.

Tests: site-visit domain and checklist regression, immutable backup copy,
invalid backups, role/branch/remote write denial, coverage, Web/Desktop build,
installed Windows smoke and feature-click tests. No commercial release or
customer UAT is implied by merge.
