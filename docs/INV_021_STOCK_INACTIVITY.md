# INV-021 — Current-stock inactivity alert, 90/180/365 days

A **Slow / Dead Stock** tab appears in the existing Web & Windows Reports panel. It shows products currently on hand with no recorded posted sale within a 90-, 180- or 365-day horizon; use Product.createdAt as fallback when never sold. Includes last sale, current on-hand quantity, current estimated catalogue-cost value, and inactivity days. Scoped to the host-authorized active branch and gated by reports.view. CSV/Excel/PDF export uses the same rows.

### Explicit limitations
**Partial INV-021:** This is SALES INACTIVITY, not FIFO/FEFO **physical stock ageing** or physical dead-stock proof. It does not track acquisition, batch receipt or inter-branch stock transfer timestamps; after restocking it can still display 'last sale >365 days'. Catalogued cost is current, not historic lot purchase cost. Sale returns/refunds aren't re-attributed. Customers should verify stock physically before discounting or writing off items.

No new database, paid service, stock mutation, migration, or production deployment. The report is read-only and consumes first-party Products and posted Sales collections from the existing local-first store.
