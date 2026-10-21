# FIN-027 — Product-wise Original Gross Margin (vertical cut)

The Web and Windows Reports panel contains a manager-only **Product Margin** tab derived from existing paid or partially paid issued sales, with account permission and branch boundaries at the domain layer. Rows contain SKU, posted invoice count, aggregate sold quantity to 0.001, sales excluding tax, historical sale-line cost, original gross profit, and percentage. Date filters and existing CSV / Excel / PDF report export use the same approved rows.

The snapshot calculation uses original invoice line unit prices, discounts and sale-time costs; it refuses invoices with unallocated discounts, missing costs or inconsistent line/tax totals. Distinct measured cuts of the same product aggregate by product ID without losing invoice count.

**Registry status: partial FIN-027.** This is original invoice gross margin, NOT a product/service net P&L. It excludes later returns, refunds, adjustments, service job costs and overhead. The service-specific half of FIN-027 remains unimplemented. No new sync tables, cloud provider APIs, paid dependencies, production migrations, or customer release. Cloud-hosted multi-tenant scope must ultimately be verified by a trusted server instead of browser roles; current implementation is local domain/report UI.
