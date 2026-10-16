import type { ServiceOrder } from "@minarvabiz/types";

/** Staff may only be assigned while an order remains operationally open. */
export function canAssignServiceOrder(order: Pick<ServiceOrder, "status">): boolean {
  return order.status !== "delivered" && order.status !== "cancelled";
}

/** Starting work is allowed only for assigned, operationally open orders. */
export function canStartServiceAssignment(
  assignment: Pick<import("@minarvabiz/types").StaffAssignment, "status">,
  order: Pick<ServiceOrder, "status">,
): boolean {
  return assignment.status === "assigned" && canAssignServiceOrder(order);
}

/** A delivered order can be reconciled after delivery; cancelled orders cannot. */
export function canCompleteServiceAssignment(
  assignment: Pick<import("@minarvabiz/types").StaffAssignment, "status">,
  order: Pick<ServiceOrder, "status">,
): boolean {
  return (assignment.status === "assigned" || assignment.status === "in_progress") &&
    order.status !== "cancelled";
}
