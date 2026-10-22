# SVC-007 — Service Visit Spare Parts Used Register (Windows Offline)

Field technician workflow: after **Site Arrived**, an authorized manager may
select a product linked to the active branch or a global/shared catalog item, record quantity (3-decimal
precision), and note what part was physically used. The record captures
product name, SKU, unit, quantity, unit cost in integer cents and extended
original cost. It is preserved on site visit completion and in the existing
Windows SQLite domain snapshot, export/import and backup/restore.

If the staff member logged an incorrect part, use **Void entry** with a
mandatory reason; the historical entry stays visible as corrected, excluded
from active total costs. All edits use the visit's expected version, active
branch, existing linked order/assignment checks, orders.assign permission,
and existing audit trail. Historical visits with no part register import unchanged.

**Critical financial/stock boundary:** This is operational *usage evidence*,
not an inventory debit, cost-of-goods booking, a checkout sale, invoice line,
warehouse reservation, stock availability guarantee or automated consumption.
Recording, correcting and completing visits will NOT mutate product stock,
create duplicate sale/payment/GL effects, enqueue a financial outbox event,
or silently assume a warehouse location. Until the authorized branch/warehouse
consumption posting milestone is implemented, staff must separately process
physical inventory movements through approved stock workflows and reconcile
with the register. This distinction is shown prominently in the UI.

No paid services, hosted database writes, production migrations or new
installer releases. Browser production edits remain disabled for site visits.
The first-customer and cross-device Offline/Online/Hybrid UAT gates remain
unverified.

Targeted tests:
- packages/business-logic/src/__tests__/service-visit-parts.test.mjs
- packages/business-logic/src/__tests__/service-site-visit-register.test.mjs

Require exact-head CI, coverage, Windows packaging and installed smoke, UI
feature smoke, post-merge main checks, and real installed customer acceptance.
Rollback by reverting the PR; earlier snapshot schema accepts the optional
parts collection only in current source builds.
