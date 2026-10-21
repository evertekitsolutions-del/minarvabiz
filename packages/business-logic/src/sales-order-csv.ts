/**
 * SAL-003 scoped CSV — read-only original export; no invoice/stock mutations.
 * A host must pass verified org/company/branch/warehouse authority. The
 * component display gate alone does not authorize access or downloads.
 */
import type { SalesOrderAuthorizedScope, SalesOrderIntent } from "./sales-order-intent";

const HEADERS = [
  "order_number","status","created_at","due_date","customer_id","currency",
  "line_id","product_id","description","quantity_milli",
  "unit_price_minor","discount_minor","tax_minor","line_total_minor",
  "order_total_minor","invoice_id","notes",
];

function csv(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Invalid sales-order minor amount");
    return String(value);
  }
  if (value == null) return "";
  if (typeof value !== "string") throw new Error("Unexpected sales-order export field");
  // Prevent spreadsheet formula evaluation, including zero-width/BOM/whitespace prefixes.
  const protectedValue = /^[\s\uFEFF\u200B]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(protectedValue)
    ? `"${protectedValue.replace(/"/g, '""')}"`
    : protectedValue;
}
export function exportSalesOrdersCsv(
  orders: readonly SalesOrderIntent[],
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): string {
  if (enabled !== true) throw new Error("SAL-003 feature is disabled");
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order permission denied");
  for (const key of ["organizationId", "companyId", "branchId", "warehouseId"] as const) {
    if (typeof auth[key] !== "string" || !auth[key]) throw new Error("Missing trusted sales-order scope");
  }
  if (!Array.isArray(orders)) throw new Error("Invalid sales-order export selection");
  const rows: string[] = [];
  for (const order of orders) {
    for (const key of ["organizationId", "companyId", "branchId", "warehouseId"] as const) {
      if (order?.[key] !== auth[key]) throw new Error("Cross-scope sales-order export denied");
    }
    if (!order || !Array.isArray(order.lines) || order.lines.length < 1) {
      throw new Error("Malformed sales-order export record");
    }
    for (const line of order.lines) {
      const fields = [
        order.orderNumber,order.status,order.createdAt,order.dueDate,order.customerId,
        order.currency,line.id,line.productId,line.description,line.quantityMilli,
        line.unitPriceMinor,line.discountMinor,line.taxMinor,line.totalMinor,
        order.totalMinor,order.invoiceId,order.note,
      ];
      rows.push(fields.map(csv).join(","));
    }
  }
  return [HEADERS.join(","),...rows].join("\n")+"\n";
}
