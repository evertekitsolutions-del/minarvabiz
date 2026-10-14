import type { Sale } from "@minarvabiz/types";

type ExportableSale = Pick<
  Sale,
  | "saleDate"
  | "invoiceNumber"
  | "customerName"
  | "status"
  | "subtotal"
  | "discountAmount"
  | "taxAmount"
  | "total"
  | "paidAmount"
  | "balanceAmount"
  | "items"
  | "notes"
>;

const HEADER = [
  "invoice_date",
  "invoice_number",
  "customer",
  "status",
  "subtotal",
  "discount",
  "tax",
  "total",
  "paid",
  "balance",
  "products",
  "notes",
].join(",");

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invoice contains an invalid numeric amount.");
    return String(value);
  }
  const raw = value ?? "";
  // Avoid formula execution in Excel/Calc, including whitespace-prefixed payloads.
  const escaped = /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/u.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/**
 * Exports the exact caller-supplied invoice rows (e.g. current Sales History
 * filters), including returns/cancellations; this is not a net revenue report.
 * Pure across web, Windows offline, and hybrid runtimes.
 */
export function exportSalesHistoryCsv(sales: readonly ExportableSale[]): string {
  const records = sales.map((sale) =>
    [
      sale.saleDate,
      sale.invoiceNumber,
      sale.customerName || "Walk-in",
      sale.status,
      sale.subtotal,
      sale.discountAmount,
      sale.taxAmount,
      sale.total,
      sale.paidAmount,
      sale.balanceAmount,
      sale.items.map((item) => item.productName).join("; "),
      sale.notes,
    ]
      .map(csvCell)
      .join(","),
  );
  return [HEADER, ...records].join("\n") + "\n";
}
