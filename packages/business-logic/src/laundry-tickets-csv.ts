import type { LaundryOrder } from "@minarvabiz/types";

type ExportableTicket = Pick<LaundryOrder,
  | "orderNumber"
  | "createdAt"
  | "customerName"
  | "mode"
  | "status"
  | "garment"
  | "quantity"
  | "supplierName"
  | "totalCustomerCharge"
  | "totalSupplierCost"
  | "profit"
  | "paidAmount"
  | "balanceAmount"
  | "notes"
>;

const HEADER = "ticket_number,date,customer,mode,status,garment,quantity,supplier,customer_charge,supplier_cost,profit,paid,balance,notes";

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Laundry ticket contains an invalid numeric value.");
    return String(value);
  }
  const text = value ?? "";
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[",\r\n]/u.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

/** Export the exact caller-filtered laundry tickets; retains cancellations for traceability. */
export function exportLaundryTicketsCsv(tickets: readonly ExportableTicket[]): string {
  const rows = tickets.map((ticket) => [
    ticket.orderNumber,
    ticket.createdAt,
    ticket.customerName || "",
    ticket.mode,
    ticket.status,
    ticket.garment,
    ticket.quantity,
    ticket.supplierName,
    ticket.totalCustomerCharge,
    ticket.totalSupplierCost,
    ticket.profit,
    ticket.paidAmount,
    ticket.balanceAmount,
    ticket.notes,
  ].map(csvCell).join(","));
  return [HEADER, ...rows].join("\n") + "\n";
}
