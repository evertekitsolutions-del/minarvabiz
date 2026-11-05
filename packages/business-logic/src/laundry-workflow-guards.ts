import type { LaundryItem, LaundryItemProcessingStatus } from "@minarvabiz/types";

const nextStatus: Record<LaundryItemProcessingStatus, LaundryItemProcessingStatus | null> = {
  received: "washing",
  washing: "ironing",
  ironing: "quality_check",
  quality_check: "ready",
  ready: "delivered",
  delivered: null,
};

export function canMoveLaundryItem(current: LaundryItem, status: LaundryItemProcessingStatus): boolean {
  return current.processingStatus === status || nextStatus[current.processingStatus] === status
    || (current.processingStatus === "quality_check" && current.qualityStatus === "failed" && status === "ironing");
}

export function validateLaundryItemMutation(current: LaundryItem | undefined, next: LaundryItem): string | null {
  if (!current || !next.label.trim() || !Number.isFinite(next.quantity) || next.quantity <= 0 || next.quantity > 100000
    || !["received", "washing", "ironing", "quality_check", "ready", "delivered"].includes(next.processingStatus)
    || !["pending", "passed", "failed"].includes(next.qualityStatus)
    || next.label !== current.label || next.quantity !== current.quantity || next.tagCode !== current.tagCode
    || next.serviceCode !== current.serviceCode || next.fabricType !== current.fabricType || next.tatHours !== current.tatHours
    || next.customerRate !== current.customerRate || next.supplierRate !== current.supplierRate) {
    return "Garment identity, tag and quantity are immutable after ticket posting";
  }
  if (!canMoveLaundryItem(current, next.processingStatus)) {
    return `Invalid item workflow transition for ${current.tagCode}`;
  }
  if (next.processingStatus === "ready" && next.qualityStatus !== "passed") {
    return "Quality check must pass before an item can be marked ready";
  }
  if (next.qualityStatus !== current.qualityStatus && current.processingStatus !== "ironing" && current.processingStatus !== "quality_check") {
    return "Quality result can only be changed during quality check";
  }
  return null;
}
