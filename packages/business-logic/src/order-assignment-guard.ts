import type { ServiceOrder } from "@minarvabiz/types";

/** Staff may only be assigned while an order remains operationally open. */
export function canAssignServiceOrder(order: Pick<ServiceOrder, "status">): boolean {
  return order.status !== "delivered" && order.status !== "cancelled";
}
