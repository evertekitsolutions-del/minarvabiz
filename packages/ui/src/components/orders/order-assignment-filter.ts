import type { ServiceOrder, StaffAssignment, StaffMember } from "@minarvabiz/types";

type Order = Pick<ServiceOrder, "id" | "assignedStaffId" | "assignedTailorId">;
type Assignment = Pick<StaffAssignment, "orderId" | "staffId" | "staffName" | "status">;
type Staff = Pick<StaffMember, "id" | "name">;

/** Assignment records supersede old single-assignee fields, even after cancellation. */
export function assignedStaffIdsForOrder(order: Order, assignments: readonly Assignment[]): string[] {
  const rows = assignments.filter((assignment) => assignment.orderId === order.id);
  if (rows.length > 0) {
    return [...new Set(rows.filter((assignment) => assignment.status !== "cancelled").map((assignment) => assignment.staffId))];
  }
  return [...new Set([order.assignedStaffId, order.assignedTailorId].filter((id): id is string => Boolean(id)))];
}

/** Apply staff selection to the same rows used by the filtered CSV export. */
export function filterServiceOrdersByAssignedStaff<T extends Order>(
  orders: readonly T[], assignments: readonly Assignment[], staffId: string,
): T[] {
  if (!staffId) return [...orders];
  const byOrder = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const rows = byOrder.get(assignment.orderId) ?? [];
    rows.push(assignment);
    byOrder.set(assignment.orderId, rows);
  }
  return orders.filter((order) => {
    const ids = assignedStaffIdsForOrder(order, byOrder.get(order.id) ?? []);
    return staffId === "unassigned" ? ids.length === 0 : ids.includes(staffId);
  });
}

/** Preserve historical display names when assignees are no longer active. */
export function assignedStaffNamesForOrder(
  order: Order, assignments: readonly Assignment[], staff: readonly Staff[],
): string[] {
  const matching = assignments.filter((assignment) => assignment.orderId === order.id);
  const ids = assignedStaffIdsForOrder(order, matching);
  return ids.map((id) =>
    matching.find((assignment) => assignment.staffId === id && assignment.status !== "cancelled")?.staffName?.trim() ||
    staff.find((member) => member.id === id)?.name || id
  );
}
