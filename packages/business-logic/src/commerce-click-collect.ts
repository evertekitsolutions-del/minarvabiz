/**
 * COM-007 — optional, provider-neutral click-and-collect transition contract.
 * Original Minarva Biz implementation. No external runtime or licensed donor.
 * Callers must persist the returned revision + event ID atomically and enforce
 * authenticated identity / branch grants at the API boundary.
 */
export type PickupStatus = "awaiting_payment" | "preparing" | "ready" | "collected" | "cancelled";
export type PickupAction = "payment_confirmed" | "mark_ready" | "handover" | "cancel";
export type PickupRole = "merchant_staff" | "customer";

export interface PickupScope {
  tenantId: string;
  companyId: string;
  branchId: string;
}
export interface PickupOrder extends PickupScope {
  id: string;
  customerId: string;
  status: PickupStatus;
  revision: number;
  lastEventId: string | null;
  paymentVerified: boolean;
  pickupEnabled: boolean;
}
export interface PickupTransitionInput {
  order: PickupOrder;
  scope: PickupScope;
  eventId: string;
  expectedRevision: number;
  action: PickupAction;
  actorRole: PickupRole;
  actorCustomerId?: string;
  /** Verified by a trusted API, not accepted directly from a browser field. */
  pickupProofVerified?: boolean;
}
export interface PickupTransition {
  order: PickupOrder;
  applied: boolean;
  event: { id: string; orderId: string; action: PickupAction; from: PickupStatus; to: PickupStatus; revision: number } | null;
}
const actions: Record<PickupStatus, Partial<Record<PickupAction, PickupStatus>>> = {
  awaiting_payment: { payment_confirmed: "preparing", cancel: "cancelled" },
  preparing: { mark_ready: "ready", cancel: "cancelled" },
  ready: { handover: "collected", cancel: "cancelled" },
  collected: {},
  cancelled: {},
};
function canonical(value: string, label: string): string {
  if (typeof value !== "string" || value.length > 128 || !value.trim() || value !== value.trim()) {
    throw new Error(label + " must be a canonical nonempty ID");
  }
  return value;
}
function validateScope(scope: PickupScope): void {
  canonical(scope.tenantId, "Tenant");
  canonical(scope.companyId, "Company");
  canonical(scope.branchId, "Branch");
}
export function transitionClickCollect(input: PickupTransitionInput): PickupTransition {
  if (!input || !input.order || !input.scope) throw new Error("Pickup context is required");
  const { order, scope } = input;
  validateScope(scope);
  validateScope(order);
  canonical(order.id, "Order");
  canonical(order.customerId, "Customer");
  canonical(input.eventId, "Event");
  if (order.lastEventId !== null) canonical(order.lastEventId, "Previous event");
  if (order.tenantId !== scope.tenantId || order.companyId !== scope.companyId ||
      order.branchId !== scope.branchId) throw new Error("Pickup scope mismatch");
  if (!order.pickupEnabled) throw new Error("Click-and-collect is disabled for this order");
  if (!Number.isSafeInteger(order.revision) || order.revision < 0 ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("Invalid pickup revision");
  }
  if (!Object.prototype.hasOwnProperty.call(actions, order.status)) throw new Error("Unknown pickup status");
  if (typeof order.paymentVerified !== "boolean") throw new Error("Payment evidence is required");
  if (input.actorRole !== "merchant_staff" && input.actorRole !== "customer") {
    throw new Error("Unauthorized pickup role");
  }
  if (input.actorRole === "customer" &&
      (canonical(input.actorCustomerId ?? "", "Actor customer") !== order.customerId ||
        input.action !== "cancel")) throw new Error("Customer may only cancel own order");
  // A single last-event identity is sufficient only for immediate retry; a
  // durable unique event ledger is required for older replay protection.
  if (order.lastEventId === input.eventId) {
    if (order.revision !== input.expectedRevision + 1) {
      throw new Error("Event replay revision mismatch");
    }
    return { order: { ...order }, applied: false, event: null };
  }
  if (order.revision !== input.expectedRevision) throw new Error("Stale pickup revision");
  const to = actions[order.status][input.action];
  if (!to) throw new Error("Invalid pickup transition");
  if (input.action === "payment_confirmed" && !order.paymentVerified) {
    throw new Error("Payment must be verified before preparing");
  }
  if (input.action === "mark_ready" && !order.paymentVerified) {
    throw new Error("Unpaid order cannot be marked ready");
  }
  if (input.action === "handover" && (!order.paymentVerified || input.pickupProofVerified !== true)) {
    throw new Error("Verified payment and pickup proof are required for handover");
  }
  const nextRevision = order.revision + 1;
  if (!Number.isSafeInteger(nextRevision)) throw new Error("Pickup revision exhausted");
  return {
    order: { ...order, status: to, revision: nextRevision, lastEventId: input.eventId },
    applied: true,
    event: { id: input.eventId, orderId: order.id, action: input.action, from: order.status, to, revision: nextRevision },
  };
}
