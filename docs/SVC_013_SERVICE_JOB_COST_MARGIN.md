# SVC-013 — Field Service Job Cost and Profitability Range

This is a read-only operational cost reconciliation worksheet in the existing
Service Orders → Field Service Site Visits section for accounting.view users.

One service order is counted exactly ONCE, regardless of the number of
technician visits. Order value comes from the current net ServiceOrder.price
(not an audited payment receipt), original material and direct expense costs
come from ServiceOrder.externalMaterialCost and orderExpensesTotal, and the
new SVC-007 parts-used references are aggregated from all noncancelled
site visits for that job. Voided part entries are excluded from cost totals.

There is no authoritative cross-reference establishing whether parts already
appear in the order's original material/expense costs. To avoid falsely
double-posting parts, the worksheet shows a *profit interval*:

  Upper estimate = Order net value - recorded order-level costs
  Lower estimate = Upper estimate - recorded parts-used cost

The upper bound assumes all annotated parts were already counted in order
expenses; the lower bound assumes none were. Neither should be reported as
verified realized profit. Actual GL, inventory issue posting, wages,
unattributed overhead, taxes, returns, cash collection, and contractual
financial reporting remain outside this scope. Underlying parts-used entries
are not inventory debits or invoiced charges.

The report only receives visits already scoped by active branch plus
reports.view. The UI additionally requires accounting.view; it rejects
an order-visit branch mismatch, duplicate order/visit/part identifiers and
invalid monetary amounts. Cancelled or deleted orders and cancelled visits
are excluded. CSV output protects against spreadsheet formula injection.

No database change, online persistence, third-party paid service, GL posting,
scheduled action, customer communication, automatic invoice, or Windows
installer release is part of this patch.

Tests: packages/business-logic/src/__tests__/service-job-cost-report.test.mjs.
Acceptance: exact-head CI, Web/Desktop typechecks, coverage, Windows installed
deep smoke, click smoke, and postmerge checks. Full Offline/Online/Hybrid
customer UAT, versioned signed installer release and critical Next.js
dependency audit repair remain separate release gates.
