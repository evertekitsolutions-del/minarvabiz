import type { ServiceOrder } from "@minarvabiz/types";

type ExportableOrder = Pick<
  ServiceOrder,
  | "orderNumber"
  | "orderDate"
  | "deliveryDate"
  | "customerName"
  | "serviceType"
  | "status"
  | "price"
  | "discount"
  | "advance"
  | "balance"
  | "quantity"
  | "notes"
>;

const HEADER = "order_number,order_date,delivery_date,customer,service_type,status,price,discount,advance,balance,quantity,notes";

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Service order contains an invalid numeric amount.");
    return String(value);
  }
  const text = value ?? "";
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[",\r\n]/u.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

/** Export the exact UI-selected service order rows; no accounting mutations. */
export function exportServiceOrdersCsv(orders: readonly ExportableOrder[]): string {
  const rows = orders.map((order) => [
    order.orderNumber,
    order.orderDate,
    order.deliveryDate,
    order.customerName || "",
    order.serviceType,
    order.status,
    order.price,
    order.discount,
    order.advance,
    order.balance,
    order.quantity,
    order.notes,
  ].map(csvCell).join(","));
  return [HEADER, ...rows].join("\n") + "\n";
}
