import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { canTransition } from "./orders";
import type { OrderQualityCheck } from "./quality-control-types";
import type { UUID } from "@minarvabiz/types";
import * as ordersStore from "./orders-store";
import { nowISO } from "@minarvabiz/utils";

export function getOrderQualityCheck(orderId: UUID): OrderQualityCheck | null {
  return ordersStore.getOrder(orderId)?.qualityCheck ?? null;
}

export function recordOrderQualityCheck(input: {
  orderId: UUID;
  passed: boolean;
  notes?: string | null;
  issues?: string[];
  checkedBy?: UUID | null;
}): { order: ReturnType<typeof ordersStore.getOrder>; qualityCheck: OrderQualityCheck | null; error?: string } {
  assertPermission("orders.manage");
  const order = ordersStore.getOrder(input.orderId);
  if (!order) return { order: undefined, qualityCheck: null, error: "Order not found" };
  if (order.status !== "qc") {
    return { order: undefined, qualityCheck: null, error: "Quality check can only be recorded while the order is in Quality Check." };
  }

  const issues = (input.issues ?? []).map((issue) => issue.trim()).filter(Boolean);
  if (!input.passed && issues.length === 0) {
    return { order: undefined, qualityCheck: null, error: "Add at least one issue before sending an order for rework." };
  }

  const nextStatus = input.passed ? "ready_to_deliver" : "processing";
  if (!canTransition(order.status, nextStatus)) {
    return { order: undefined, qualityCheck: null, error: `Cannot move order from ${order.status} to ${nextStatus}` };
  }

  const qualityCheck: OrderQualityCheck = {
    status: input.passed ? "passed" : "failed",
    checkedAt: nowISO(),
    checkedBy: input.checkedBy ?? null,
    notes: input.notes?.trim() || null,
    issues,
  };

  order.qualityCheck = qualityCheck;
  order.status = nextStatus;
  order.updatedAt = nowISO();
  order.version += 1;
  touchPersistence();
  return { order, qualityCheck };
}
