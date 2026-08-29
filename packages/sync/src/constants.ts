export const FINANCIAL_TABLES = new Set([
  "sales",
  "sale_items",
  "payments",
  "orders",
  "order_expenses",
  "expenses",
  "purchases",
  "returns",
  "invoices",
]);

export function isFinancialTable(tableName: string): boolean {
  return FINANCIAL_TABLES.has(tableName);
}
