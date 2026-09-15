/** Delivery readiness, dispatch and SLA intelligence. */

export type DeliveryStatus = "pending" | "ready" | "dispatched" | "delivered" | "failed" | "cancelled";

export interface DeliveryItem {
  id: string;
  orderId: string;
  customerId: string;
  promisedAt?: string | null;
  status: DeliveryStatus;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface DeliverySla {
  overdue: boolean;
  dueToday: boolean;
  daysLate: number;
  onTime: boolean;
}

function parse(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function deliverySla(delivery: DeliveryItem, now = new Date()): DeliverySla {
  const promised = parse(delivery.promisedAt);
  const delivered = parse(delivery.deliveredAt);
  if (promised == null) return { overdue: false, dueToday: false, daysLate: 0, onTime: delivered != null };
  const target = delivered ?? now.getTime();
  const dayTarget = new Date(target).toISOString().slice(0, 10);
  const dayPromised = new Date(promised).toISOString().slice(0, 10);
  const dayDiff = Math.round((Date.parse(dayTarget) - Date.parse(dayPromised)) / 86_400_000);
  return { overdue: delivered == null && dayDiff > 0, dueToday: delivered == null && dayDiff === 0, daysLate: Math.max(0, dayDiff), onTime: delivered != null && dayDiff <= 0 };
}

export function deliveryProgress(status: DeliveryStatus): number {
  switch (status) {
    case "pending": return 0;
    case "ready": return 25;
    case "dispatched": return 60;
    case "delivered": return 100;
    case "failed": return 60;
    case "cancelled": return 0;
    default: return 0;
  }
}

export function eligibleForDispatch(
  productionStage: string,
  paidBalance: number,
  requirePaymentClearance = false,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (productionStage !== "ready_to_deliver") reasons.push("Order is not ready to deliver");
  if (requirePaymentClearance && paidBalance > 0) reasons.push(`Outstanding balance: ${paidBalance}`);
  return { eligible: reasons.length === 0, reasons };
}

export function deliveryStatusLabel(status: DeliveryStatus): string {
  return {
    pending: "Pending",
    ready: "Ready",
    dispatched: "Dispatched",
    delivered: "Delivered",
    failed: "Delivery failed",
    cancelled: "Cancelled",
  }[status];
}
