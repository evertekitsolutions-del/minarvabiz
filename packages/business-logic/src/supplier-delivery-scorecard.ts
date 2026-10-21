/**
 * PUR-011 — supplier delivery performance, using existing purchase orders and
 * goods receipts. Original Minarva implementation of common vendor scorecard
 * patterns (Odoo/Dolibarr); no external source code or dependency is used.
 *
 * Read-only reporting. A purchase order is NOT a recorded supplier invoice.
 */
import type { GoodsReceipt, PurchaseOrder, Supplier } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits, toQuantityMilli } from "@minarvabiz/utils";

export interface SupplierDeliveryScore {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly approvedOrders: number;
  readonly receivedOrders: number;
  readonly deadlineDeliveries: number;
  readonly deliveredOnTime: number;
  /** null means no completed purchases with an expected date. */
  readonly onTimePercent: number | null;
  /** Weighted equally by PO line, since lines can use incompatible units. */
  readonly receiptFillPercent: number | null;
  readonly overdueOpenOrders: number;
  /** Ordered value is not cash spending or a posted AP amount. */
  readonly orderedValue: number;
}

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

function quantityMilli(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid supplier delivery quantity");
  const milli = toQuantityMilli(value);
  if (!Number.isSafeInteger(milli) || Math.abs(value * 1000 - milli) > 0.000001) {
    throw new Error("Invalid supplier delivery quantity precision");
  }
  return milli;
}

function day(value: string): string {
  const date = value.slice(0, 10);
  if (!validDate(date)) throw new Error("Invalid supplier delivery date");
  return date;
}

/**
 * Scores ONLY approved/partially received/received POs. GRNs are authoritative
 * for physical receipts, not the cached receivedQuantity on mutable PO lines.
 * No supplier ratings are inferred without actual deadline/receipt evidence.
 */
export function buildSupplierDeliveryScores(
  suppliers: readonly Supplier[],
  orders: readonly PurchaseOrder[],
  receipts: readonly GoodsReceipt[],
  asOfDate: string,
): SupplierDeliveryScore[] {
  if (!validDate(asOfDate)) throw new Error("Invalid scorecard date");
  const activeSuppliers = suppliers.filter(s => !s.deletedAt);
  const supplierById = new Map(activeSuppliers.map(s => [s.id, s]));
  if (supplierById.size !== activeSuppliers.length) throw new Error("Duplicate supplier IDs");

  const eligible = orders.filter(o => !o.deletedAt && o.status !== "cancelled" && o.status !== "draft");
  const eligibleById = new Map(eligible.map(o => [o.id, o]));
  if (eligibleById.size !== eligible.length) throw new Error("Duplicate purchase order IDs");
  const ordersBySupplier = new Map<string, PurchaseOrder[]>();
  const orderLineIds = new Map<string, Set<string>>();
  for (const order of eligible) {
    orderLineIds.set(order.id, new Set(order.lines.map(line => line.id)));
    if (!supplierById.has(order.supplierId)) continue;
    const group = ordersBySupplier.get(order.supplierId) ?? [];
    group.push(order);
    ordersBySupplier.set(order.supplierId, group);
  }
  const received = new Map<string, Map<string, number>>();
  const lastReceipts = new Map<string, string>();
  const receiptIds = new Set<string>();

  for (const receipt of receipts) {
    if (receiptIds.has(receipt.id)) continue;
    receiptIds.add(receipt.id);
    const order = eligibleById.get(receipt.purchaseOrderId);
    if (!order || order.supplierId !== receipt.supplierId ||
        (order.branchId != null && receipt.branchId != null && order.branchId !== receipt.branchId)) {
      continue;
    }
    const allowedLines = orderLineIds.get(order.id)!;
    const quantities = received.get(order.id) ?? new Map<string, number>();
    for (const line of receipt.lines) {
      if (!allowedLines.has(line.purchaseOrderLineId)) continue;
      const next = (quantities.get(line.purchaseOrderLineId) ?? 0) +
        quantityMilli(line.receivedQuantity);
      if (!Number.isSafeInteger(next)) throw new Error("Supplier receipt quantity overflow");
      quantities.set(line.purchaseOrderLineId, next);
    }
    received.set(order.id, quantities);
    const date = day(receipt.receiptDate);
    if (date > (lastReceipts.get(order.id) ?? "")) lastReceipts.set(order.id, date);
  }

  const scores: SupplierDeliveryScore[] = [];
  for (const supplier of activeSuppliers) {
    const supplierOrders = ordersBySupplier.get(supplier.id) ?? [];
    let approvedOrders = 0, receivedOrders = 0, deadlineDeliveries = 0;
    let deliveredOnTime = 0, overdueOpenOrders = 0;
    let totalLineCompletion = 0, trackedLines = 0, orderValueMinor = 0;

    for (const order of supplierOrders) {
      approvedOrders++;
      if (!Number.isFinite(order.total) || order.total < 0) throw new Error("Invalid purchase order value");
      orderValueMinor = addMinorUnits(orderValueMinor, toMinorUnits(order.total));
      const quantities = received.get(order.id);
      let completed = order.lines.length > 0;
      for (const line of order.lines) {
        const ordered = quantityMilli(line.orderedQuantity);
        if (ordered === 0) throw new Error("Purchase order contains zero-quantity line");
        const delivered = quantities?.get(line.id) ?? 0;
        totalLineCompletion += Math.min(1, delivered / ordered);
        trackedLines++;
        if (delivered < ordered) completed = false;
      }
      const deadline = order.expectedDeliveryDate ? day(order.expectedDeliveryDate) : null;
      if (completed) {
        receivedOrders++;
        if (deadline && lastReceipts.has(order.id)) {
          deadlineDeliveries++;
          if (lastReceipts.get(order.id)! <= deadline) deliveredOnTime++;
        }
      } else if (deadline && deadline < asOfDate) {
        overdueOpenOrders++;
      }
    }
    scores.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      approvedOrders,
      receivedOrders,
      deadlineDeliveries,
      deliveredOnTime,
      onTimePercent: deadlineDeliveries
        ? Math.round((deliveredOnTime / deadlineDeliveries) * 1000) / 10 : null,
      receiptFillPercent: trackedLines
        ? Math.round((totalLineCompletion / trackedLines) * 1000) / 10 : null,
      overdueOpenOrders,
      orderedValue: fromMinorUnits(orderValueMinor),
    });
  }
  return scores.sort((a, b) =>
    b.overdueOpenOrders - a.overdueOpenOrders ||
    a.supplierName.localeCompare(b.supplierName) ||
    a.supplierId.localeCompare(b.supplierId));
}
