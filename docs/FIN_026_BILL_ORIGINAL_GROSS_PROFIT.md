# FIN-026 — Bill-wise Original Gross Profit

A manager/admin-only **Bill Profit** tab appears in the existing Web/Windows Reports panel, with date filters, invoice IDs, customer labels, revenue excluding tax, historical COGS, original gross profit and margin. Dashboard totals and existing CSV/Excel/PDF exports derive from precisely the same permission-checked rows.

The authoritative SAL-026 posted-invoice calculator is reused. Draft, archived, cancelled and returned invoices are excluded. Invalid cost/tax/invoice totals fail closed; branch is sourced from the active domain scope and the reader requires accounting.view.

**Partial FIN-026:** The displayed result is ORIGINAL posted-invoice gross margin and not a reconciled net result. Subsequent return/refund credits, service and payment costs, overhead, write-offs and allocations are not reflected. No live migration, new schema, recurring paid infrastructure or customer software release.
