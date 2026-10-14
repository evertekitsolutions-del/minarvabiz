import type { ServiceOrder } from "@minarvabiz/types";

type DatedOrder = Pick<ServiceOrder, "deliveryDate" | "status">;

/** Browser/shop-local date; never compare a UTC day with local due dates. */
export function localBusinessDate(date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

/** An undelivered order becomes overdue only after its promised delivery day. */
export function isOverdueServiceOrder(order: DatedOrder, today: string): boolean {
  if (order.status === "delivered" || order.status === "cancelled") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const dueDate = String(order.deliveryDate || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < today;
}
