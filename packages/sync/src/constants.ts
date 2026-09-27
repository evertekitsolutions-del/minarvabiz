/**
 * Tables where an automatic last-write-wins decision can corrupt money, stock,
 * statutory history, or document traceability. Conflicts on these aggregates
 * are always surfaced for explicit review.
 */
export const FINANCIAL_TABLES = new Set([
  "sales",
  "sale_items",
  "payments",
  "sale_returns",
  "purchase_returns",
  "orders",
  "order_expenses",
  "laundry_orders",
  "expenses",
  "purchases",
  "purchase_orders",
  "purchase_order_lines",
  "goods_receipts",
  "goods_receipt_lines",
  "purchase_invoices",
  "purchase_invoice_lines",
  "accounts",
  "journal_entries",
  "journal_entry_lines",
  "cash_register_sessions",
  "inventory_transactions",
  "warehouse_stock",
  "warehouse_transfers",
]);

export function isFinancialTable(tableName: string): boolean {
  return FINANCIAL_TABLES.has(tableName);
}
