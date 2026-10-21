# FIN-025 Customer-wise Original Gross Margin — first vertical cut

Customer report appears in the existing Reports & Analytics panel in both Windows and Web, only for accounting.view roles. It uses the existing issued invoice historic line costs, never today's catalogue cost. User-selected date range uses original invoice issue dates; export CSV/Excel/PDF uses the same gated rows.

Deliberate limits: This is **original gross margin**, not full customer/party net P&L. It excludes subsequent returns, refunds, service job profit, customer incentives, overhead and credit adjustments. Therefore FIN-025 remains **partial** until those flows are modeled and reconciled. Archived, draft, cancelled, returned, walk-in and foreign-branch invoices are excluded. Corrupt posted invoice data stops the report rather than silently understating cost.

No migrations, new storage, paid services, third-party code, or web deployment. Data derives from existing scoped local/domain sales, uses current offline-first backup/sync architecture. Export/replace adapter: existing reports CSV/Excel/PDF, and a pure customer-margin calculator suitable for other database providers. SaaS server-side tenant and fresh role enforcement remain a separate integration gate before exposure in public APIs.
