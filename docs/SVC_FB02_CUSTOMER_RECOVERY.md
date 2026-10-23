# SVC-FB02 — Low-rating customer recovery follow-up

A completed field service visit with a **staff-confirmed customer rating of
1 or 2 out of 5** can open a manual follow-up recovery case. Staff enter the
follow-up due date and action plan; after actually contacting the customer,
they record the contact method and summary. They can then close the case as
resolved or closed unresolved with an outcome explanation. No automatic
customer calls, messages, surveys, public reviews or satisfaction assertion.

The active branch's Service Visits view displays counts for open, contacted,
overdue, resolved and unresolved cases. A due date is overdue only starting
the following local calendar day. Closed cases are immutable; no silent
reopen, editing old feedback or automatic Google review solicitation.

**Authority:** existing orders.assign right to edit with an active branch
and verified same-branch noncancelled service order/customer. Existing
reports.view right protects the source visits and read-only summary.
Production Web remains read-only; trusted Windows Offline writes persist
inside the already-backed-up service site visit snapshot.

**Safety:** version compare-and-swap on every transition; no false automatic
confirmation of customer contact. New records have optional recovery=null.
Old backups omit it and remain valid. Chronology, missing fields and state
transitions are validated before store mutation. Audit events contain only
the status, due date and staff-confirmed timestamp/medium, never private
customer response text or contact notes.

This is a customer follow-up operations feature, not a refund, warranty
claim, replacement work order or financial posting. It does not update stock,
GL, invoice, licensing, commercial release or hosted cloud synchronization.

Test scope: service-visit-recovery.test.mjs and service-site-visit-register.test.mjs;
require exact-head CI, Web/Desktop builds, Windows feature-click and deep
installed smoke, core coverage, and main post-merge checks before merge.
No new paid infrastructure or hosted migration.
