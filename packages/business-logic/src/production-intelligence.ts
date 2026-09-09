/**
 * Production control intelligence derived from the existing service-order pipeline.
 * This layer is deterministic and UI-agnostic so desktop, web, and future mobile
 * clients can surface the same operational signals without duplicating business rules.
 */
import type { OrderStatus, ServiceOrder, StaffAssignment, StaffMember, UUID } from "@minarvabiz/types";

export interface ProductionStageSummary {
  status: OrderStatus;
  label: string;
  count: number;
}

export interface ProductionRiskOrder {
  orderId: UUID;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  deliveryDate: string | null;
  daysUntilDue: number | null;
  assignedStaffId: UUID | null;
  assignedStaffName: string | null;
  risk: "overdue" | "due_today" | "due_soon" | "unassigned";
}

export interface ProductionStaffLoad {
  staffId: UUID;
  staffName: string;
  activeAssignments: number;
  dueSoonAssignments: number;
  overdueAssignments: number;
}

export interface ProductionControlSnapshot {
  totalActive: number;
  unassigned: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  readyToDeliver: number;
  inProduction: number;
  stages: ProductionStageSummary[];
  risks: ProductionRiskOrder[];
  staffLoad: ProductionStaffLoad[];
}

const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "received",
  "cutting",
  "stitching",
  "alteration",
  "qc",
  "processing",
  "ready_to_deliver",
];

const IN_PRODUCTION_STATUSES: OrderStatus[] = [
  "cutting",
  "stitching",
  "alteration",
  "qc",
  "processing",
];

const STAGE_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  received: "Received",
  cutting: "Cutting",
  stitching: "Stitching",
  alteration: "Alteration",
  qc: "Quality Check",
  processing: "Processing",
  ready_to_deliver: "Ready to Deliver",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function startOfDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

export function getProductionControlSnapshot(
  orders: ServiceOrder[],
  staff: StaffMember[] = [],
  assignments: StaffAssignment[] = [],
  now = new Date()
): ProductionControlSnapshot {
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && !o.deletedAt);
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const latestAssignmentByOrder = new Map<UUID, StaffAssignment>();

  for (const assignment of assignments) {
    if (assignment.status === "cancelled") continue;
    const previous = latestAssignmentByOrder.get(assignment.orderId);
    if (!previous || assignment.assignedAt > previous.assignedAt) {
      latestAssignmentByOrder.set(assignment.orderId, assignment);
    }
  }

  const risks: ProductionRiskOrder[] = [];
  let overdue = 0;
  let dueToday = 0;
  let dueSoon = 0;
  let unassigned = 0;

  for (const order of active) {
    const assignment = latestAssignmentByOrder.get(order.id);
    const assignedStaffId = assignment?.staffId ?? order.assignedStaffId ?? order.assignedTailorId ?? null;
    const assignedStaffName = assignedStaffId
      ? staffById.get(assignedStaffId)?.name ?? assignment?.staffName ?? null
      : assignment?.staffName ?? null;

    if (!order.deliveryDate) {
      if (!assignedStaffId) unassigned += 1;
      if (!assignedStaffId || IN_PRODUCTION_STATUSES.includes(order.status)) {
        risks.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName || "Walk-in customer",
          status: order.status,
          deliveryDate: null,
          daysUntilDue: null,
          assignedStaffId,
          assignedStaffName,
          risk: "unassigned",
        });
      }
      continue;
    }

    const delivery = new Date(order.deliveryDate);
    if (Number.isNaN(delivery.getTime())) continue;
    const daysUntilDue = diffDays(now, delivery);

    let risk: ProductionRiskOrder["risk"] | null = null;
    if (daysUntilDue < 0) {
      overdue += 1;
      risk = "overdue";
    } else if (daysUntilDue === 0) {
      dueToday += 1;
      risk = "due_today";
    } else if (daysUntilDue <= 2) {
      dueSoon += 1;
      risk = "due_soon";
    }

    if (!assignedStaffId) {
      unassigned += 1;
      risk = risk ?? "unassigned";
    }

    if (risk) {
      risks.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName || "Walk-in customer",
        status: order.status,
        deliveryDate: order.deliveryDate,
        daysUntilDue,
        assignedStaffId,
        assignedStaffName,
        risk,
      });
    }
  }

  const stageCounts = new Map<OrderStatus, number>();
  for (const status of ACTIVE_STATUSES) stageCounts.set(status, 0);
  for (const order of active) stageCounts.set(order.status, (stageCounts.get(order.status) || 0) + 1);

  const stageOrder: OrderStatus[] = [
    "pending",
    "received",
    "cutting",
    "stitching",
    "alteration",
    "qc",
    "processing",
    "ready_to_deliver",
  ];

  const stages = stageOrder.map((status) => ({
    status,
    label: STAGE_LABELS[status],
    count: stageCounts.get(status) || 0,
  }));

  const staffLoad: ProductionStaffLoad[] = staff
    .filter((member) => !member.deletedAt && (member.role === "tailor" || member.role === "staff"))
    .map((member) => {
      const assignedOrders = active.filter((order) => {
        const assignment = latestAssignmentByOrder.get(order.id);
        const assignee = assignment?.staffId ?? order.assignedStaffId ?? order.assignedTailorId;
        return assignee === member.id;
      });
      const activeAssignments = assignedOrders.length;
      const dueSoonAssignments = risks.filter(
        (risk) => risk.assignedStaffId === member.id && (risk.risk === "due_today" || risk.risk === "due_soon")
      ).length;
      const overdueAssignments = risks.filter(
        (risk) => risk.assignedStaffId === member.id && risk.risk === "overdue"
      ).length;
      return {
        staffId: member.id,
        staffName: member.name,
        activeAssignments,
        dueSoonAssignments,
        overdueAssignments,
      };
    })
    .filter((load) => load.activeAssignments > 0)
    .sort((a, b) => b.activeAssignments - a.activeAssignments || a.staffName.localeCompare(b.staffName));

  const riskPriority: Record<ProductionRiskOrder["risk"], number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
    unassigned: 3,
  };
  risks.sort((a, b) => {
    const priority = riskPriority[a.risk] - riskPriority[b.risk];
    if (priority !== 0) return priority;
    const ad = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
    return ad - bd || a.orderNumber.localeCompare(b.orderNumber);
  });

  return {
    totalActive: active.length,
    unassigned,
    overdue,
    dueToday,
    dueSoon,
    readyToDeliver: active.filter((o) => o.status === "ready_to_deliver").length,
    inProduction: active.filter((o) => IN_PRODUCTION_STATUSES.includes(o.status)).length,
    stages,
    risks: risks.slice(0, 25),
    staffLoad,
  };
}
