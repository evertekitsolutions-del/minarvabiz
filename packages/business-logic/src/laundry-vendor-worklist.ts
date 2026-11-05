/** Supplier garment worklist from existing tickets; not a dispatch receipt or payable. */
import type { LaundryOrder } from "@minarvabiz/types";
import { activeLaundryBranchId, laundryRecordInActiveBranch } from "./laundry-branch-scope";
import { csvCell } from "./laundry-tickets-csv";

const HEADER = [
  "supplier", "supplier_id", "ticket", "garment_tag", "garment", "pieces",
  "service", "processing", "qc", "due_date", "ticket_status",
].join(",");

/**
 * A branch-scoped, read-only outsourced garment worksheet for handoff/reconciliation.
 * Excludes completed/cancelled tickets, does not imply vendor custody or payment.
 * Legacy non-itemized tickets appear once without a barcode.
 */
export function exportLaundryVendorWorklistCsv(orders: readonly LaundryOrder[]): string {
  if (!Array.isArray(orders) || orders.length > 100000) {
    throw new Error("Invalid laundry vendor worklist input");
  }
  if (!activeLaundryBranchId()) throw new Error("Select an active branch to export the supplier worklist");
  const seen = new Set<string>();
  const selected: LaundryOrder[] = [];
  for (const order of orders) {
    if (!order || typeof order.id !== "string" || !order.id || seen.has(order.id)) continue;
    seen.add(order.id);
    if (order.mode !== "outsourced" || order.deletedAt || !["pending", "sent", "received"].includes(order.status)
      || !laundryRecordInActiveBranch(order)) continue;
    selected.push(order);
  }
  selected.sort((a, b) => (a.supplierName || "").localeCompare(b.supplierName || "")
    || (a.dueAt || "").localeCompare(b.dueAt || "")
    || a.orderNumber.localeCompare(b.orderNumber) || a.id.localeCompare(b.id));
  const rows: string[] = [HEADER];
  for (const order of selected) {
    const items = order.items?.length ? order.items : [{
      tagCode: "", label: order.garment || "Legacy garment (no barcode)",
      quantity: order.quantity, serviceCode: "", processingStatus: "", qualityStatus: "",
    }];
    for (const item of items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error("Invalid garment quantity in vendor worklist");
      }
      rows.push([
        order.supplierName || "Unassigned supplier", order.supplierId || "",
        order.orderNumber, item.tagCode, item.label, item.quantity,
        item.serviceCode || "", item.processingStatus, item.qualityStatus,
        order.dueAt?.slice(0, 10) || "", order.status,
      ].map(csvCell).join(","));
    }
  }
  return rows.join("\r\n") + "\r\n";
}
