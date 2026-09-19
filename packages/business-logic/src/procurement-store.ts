/**
 * Procurement workflow — Purchase Orders and Goods Receipts.
 *
 * A Purchase Order is a planning/control document. A Goods Receipt posts only
 * physical inventory and received quantities. Supplier AP / purchase invoice
 * accounting remains a separate next-step document.
 */
import type {
  GoodsReceipt,
  GoodsReceiptLine,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { remoteUpsertGoodsReceipt, remoteUpsertPurchaseOrder } from "./remote-write";
import * as phase5Store from "./phase5-store";
import * as mainStore from "./store";

const purchaseOrders: PurchaseOrder[] = [];
const goodsReceipts: GoodsReceipt[] = [];
let poSequence = 0;
let grnSequence = 0;

function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function r3(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

function nextPoNumber(): string {
  poSequence += 1;
  const year = new Date().getFullYear();
  return `PO-${year}-${String(poSequence).padStart(5, "0")}`;
}

function nextGrnNumber(): string {
  grnSequence += 1;
  const year = new Date().getFullYear();
  return `GRN-${year}-${String(grnSequence).padStart(5, "0")}`;
}

function cloneOrder(order: PurchaseOrder): PurchaseOrder {
  return { ...order, lines: order.lines.map((line) => ({ ...line })) };
}

function cloneReceipt(receipt: GoodsReceipt): GoodsReceipt {
  return { ...receipt, lines: receipt.lines.map((line) => ({ ...line })) };
}

export function listPurchaseOrders(status?: PurchaseOrderStatus): PurchaseOrder[] {
  return purchaseOrders
    .filter((po) => !po.deletedAt && (!status || po.status === status))
    .map(cloneOrder)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPurchaseOrder(id: UUID): PurchaseOrder | undefined {
  const found = purchaseOrders.find((po) => po.id === id && !po.deletedAt);
  return found ? cloneOrder(found) : undefined;
}

export function listGoodsReceipts(purchaseOrderId?: UUID): GoodsReceipt[] {
  return goodsReceipts
    .filter((receipt) => !purchaseOrderId || receipt.purchaseOrderId === purchaseOrderId)
    .map(cloneReceipt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getGoodsReceipt(id: UUID): GoodsReceipt | undefined {
  const found = goodsReceipts.find((receipt) => receipt.id === id);
  return found ? cloneReceipt(found) : undefined;
}

export function createPurchaseOrder(input: {
  supplierId: UUID;
  orderDate?: string;
  expectedDeliveryDate?: string | null;
  lines: Array<{
    productId?: UUID | null;
    description?: string;
    quantity: number;
    unitCost?: number;
    taxRate?: number;
  }>;
  notes?: string | null;
  branchId?: UUID | null;
  createdBy?: UUID | null;
}): { purchaseOrder: PurchaseOrder | null; errors: string[] } {
  assertPermission("purchases.manage");
  const errors: string[] = [];
  const supplier = phase5Store.getSupplier(input.supplierId);
  if (!supplier) errors.push("Supplier is required");
  if (!input.lines.length) errors.push("Add at least one purchase-order line");

  const normalized: PurchaseOrderLine[] = [];
  for (const item of input.lines) {
    const product = item.productId ? mainStore.getProduct(item.productId) : undefined;
    const description = (item.description || product?.name || "").trim();
    const quantity = Number(item.quantity);
    const unitCost = item.unitCost == null ? Number(product?.costPrice || 0) : Number(item.unitCost);
    const taxRate = Math.max(0, Number(item.taxRate || 0));
    if (!description) errors.push("Every line needs a description or product");
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`${description || "Line"}: quantity must be greater than zero`);
    if (!Number.isFinite(unitCost) || unitCost < 0) errors.push(`${description || "Line"}: unit cost cannot be negative`);
    const base = r2(Math.max(0, quantity) * Math.max(0, unitCost));
    const taxAmount = r2(base * taxRate / 100);
    normalized.push({
      id: generateId(),
      purchaseOrderId: "",
      productId: item.productId ?? null,
      description,
      orderedQuantity: r3(quantity),
      receivedQuantity: 0,
      unitCost: r2(unitCost),
      taxRate: r2(taxRate),
      lineSubtotal: base,
      taxAmount,
      lineTotal: r2(base + taxAmount),
    });
  }
  if (errors.length || !supplier) return { purchaseOrder: null, errors };

  const id = generateId();
  normalized.forEach((line) => { line.purchaseOrderId = id; });
  const subtotal = r2(normalized.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const taxAmount = r2(normalized.reduce((sum, line) => sum + line.taxAmount, 0));
  const now = nowISO();
  const purchaseOrder: PurchaseOrder = {
    id,
    poNumber: nextPoNumber(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    status: "draft",
    orderDate: input.orderDate || now.slice(0, 10),
    expectedDeliveryDate: input.expectedDeliveryDate || null,
    lines: normalized,
    subtotal,
    taxAmount,
    total: r2(subtotal + taxAmount),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    branchId: input.branchId ?? null,
    createdBy: input.createdBy ?? null,
    version: 1,
  };
  purchaseOrders.push(purchaseOrder);
  void remoteUpsertPurchaseOrder(cloneOrder(purchaseOrder));
  auditAction("purchase_order.create", "purchase_orders", purchaseOrder.id, null, purchaseOrder);
  touchPersistence();
  return { purchaseOrder: cloneOrder(purchaseOrder), errors: [] };
}

function findMutable(id: UUID): PurchaseOrder | undefined {
  return purchaseOrders.find((po) => po.id === id && !po.deletedAt);
}

export function approvePurchaseOrder(id: UUID, approvedBy?: UUID | null): { purchaseOrder: PurchaseOrder | null; error?: string } {
  assertPermission("purchases.manage");
  const po = findMutable(id);
  if (!po) return { purchaseOrder: null, error: "Purchase order not found" };
  if (po.status !== "draft") return { purchaseOrder: null, error: "Only draft purchase orders can be approved" };
  const before = cloneOrder(po);
  po.status = "approved";
  po.approvedAt = nowISO();
  po.approvedBy = approvedBy ?? null;
  po.updatedAt = nowISO();
  po.version += 1;
  void remoteUpsertPurchaseOrder(cloneOrder(po));
  auditAction("purchase_order.approve", "purchase_orders", po.id, before, po);
  touchPersistence();
  return { purchaseOrder: cloneOrder(po) };
}

export function receivePurchaseOrder(input: {
  purchaseOrderId: UUID;
  lines: Array<{ purchaseOrderLineId: UUID; quantity: number }>;
  receiptDate?: string;
  notes?: string | null;
  createdBy?: UUID | null;
}): { goodsReceipt: GoodsReceipt | null; purchaseOrder: PurchaseOrder | null; errors: string[] } {
  assertPermission("purchases.manage");
  assertPermission("inventory.adjust");

  const errors: string[] = [];
  const po = findMutable(input.purchaseOrderId);
  if (!po) return { goodsReceipt: null, purchaseOrder: null, errors: ["Purchase order not found"] };
  if (po.status !== "approved" && po.status !== "partially_received") {
    return { goodsReceipt: null, purchaseOrder: cloneOrder(po), errors: ["Only approved purchase orders can receive goods"] };
  }
  if (!input.lines.length) return { goodsReceipt: null, purchaseOrder: cloneOrder(po), errors: ["Select at least one line to receive"] };

  const seen = new Set<string>();
  const receiptLines: GoodsReceiptLine[] = [];
  const receiptId = generateId();
  for (const item of input.lines) {
    if (seen.has(item.purchaseOrderLineId)) {
      errors.push("Duplicate purchase-order line in goods receipt");
      continue;
    }
    seen.add(item.purchaseOrderLineId);
    const poLine = po.lines.find((line) => line.id === item.purchaseOrderLineId);
    if (!poLine) {
      errors.push("Purchase-order line not found");
      continue;
    }
    const quantity = r3(Number(item.quantity));
    const remaining = r3(poLine.orderedQuantity - poLine.receivedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`${poLine.description}: received quantity must be greater than zero`);
      continue;
    }
    if (quantity > remaining) {
      errors.push(`${poLine.description}: cannot receive ${quantity}; only ${remaining} remaining`);
      continue;
    }
    if (poLine.productId && !mainStore.getProduct(poLine.productId)) {
      errors.push(`${poLine.description}: linked product no longer exists`);
      continue;
    }
    receiptLines.push({
      id: generateId(),
      goodsReceiptId: receiptId,
      purchaseOrderLineId: poLine.id,
      productId: poLine.productId ?? null,
      description: poLine.description,
      receivedQuantity: quantity,
      unitCost: poLine.unitCost,
      lineTotal: r2(quantity * poLine.unitCost),
    });
  }
  if (errors.length || !receiptLines.length) {
    return { goodsReceipt: null, purchaseOrder: cloneOrder(po), errors: errors.length ? errors : ["Nothing to receive"] };
  }

  const before = cloneOrder(po);
  const now = nowISO();
  const grnNumber = nextGrnNumber();

  for (const receiptLine of receiptLines) {
    const poLine = po.lines.find((line) => line.id === receiptLine.purchaseOrderLineId)!;
    poLine.receivedQuantity = r3(poLine.receivedQuantity + receiptLine.receivedQuantity);
    if (receiptLine.productId) {
      mainStore.adjustStock(receiptLine.productId, "stock_in", receiptLine.receivedQuantity, `Goods receipt ${grnNumber} against ${po.poNumber}`);
    }
  }

  const fullyReceived = po.lines.every((line) => r3(line.receivedQuantity) >= r3(line.orderedQuantity));
  po.status = fullyReceived ? "received" : "partially_received";
  po.updatedAt = now;
  po.version += 1;

  const goodsReceipt: GoodsReceipt = {
    id: receiptId,
    grnNumber,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName ?? null,
    receiptDate: input.receiptDate || now.slice(0, 10),
    lines: receiptLines,
    subtotal: r2(receiptLines.reduce((sum, line) => sum + line.lineTotal, 0)),
    notes: input.notes ?? null,
    createdAt: now,
    branchId: po.branchId ?? null,
    createdBy: input.createdBy ?? null,
    version: 1,
  };
  goodsReceipts.unshift(goodsReceipt);

  void remoteUpsertPurchaseOrder(cloneOrder(po));
  void remoteUpsertGoodsReceipt(cloneReceipt(goodsReceipt));
  auditAction("goods_receipt.create", "goods_receipts", goodsReceipt.id, null, {
    grnNumber: goodsReceipt.grnNumber,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    subtotal: goodsReceipt.subtotal,
    lines: goodsReceipt.lines,
  });
  auditAction("purchase_order.receive", "purchase_orders", po.id, before, po);
  touchPersistence();
  return { goodsReceipt: cloneReceipt(goodsReceipt), purchaseOrder: cloneOrder(po), errors: [] };
}

export function cancelPurchaseOrder(id: UUID): { purchaseOrder: PurchaseOrder | null; error?: string } {
  assertPermission("purchases.manage");
  const po = findMutable(id);
  if (!po) return { purchaseOrder: null, error: "Purchase order not found" };
  if (po.status === "cancelled" || po.status === "received") {
    return { purchaseOrder: null, error: "Completed/cancelled purchase order cannot be cancelled" };
  }
  if (po.lines.some((line) => line.receivedQuantity > 0)) {
    return { purchaseOrder: null, error: "Purchase order with received quantity cannot be cancelled" };
  }
  const before = cloneOrder(po);
  po.status = "cancelled";
  po.cancelledAt = nowISO();
  po.updatedAt = nowISO();
  po.version += 1;
  void remoteUpsertPurchaseOrder(cloneOrder(po));
  auditAction("purchase_order.cancel", "purchase_orders", po.id, before, po);
  touchPersistence();
  return { purchaseOrder: cloneOrder(po) };
}

export function hydrateProcurementState(input: {
  purchaseOrders?: PurchaseOrder[];
  goodsReceipts?: GoodsReceipt[];
  poSequence?: number;
  grnSequence?: number;
}) {
  if (input.purchaseOrders) {
    purchaseOrders.length = 0;
    purchaseOrders.push(...input.purchaseOrders.map(cloneOrder));
  }
  if (input.goodsReceipts) {
    goodsReceipts.length = 0;
    goodsReceipts.push(...input.goodsReceipts.map(cloneReceipt));
  }
  if (typeof input.poSequence === "number") {
    poSequence = input.poSequence;
  } else if (input.purchaseOrders?.length) {
    poSequence = Math.max(0, ...input.purchaseOrders.map((po) => Number(/(\d+)$/.exec(po.poNumber)?.[1] || 0)));
  }
  if (typeof input.grnSequence === "number") {
    grnSequence = input.grnSequence;
  } else if (input.goodsReceipts?.length) {
    grnSequence = Math.max(0, ...input.goodsReceipts.map((receipt) => Number(/(\d+)$/.exec(receipt.grnNumber)?.[1] || 0)));
  }
}

export function exportProcurementState() {
  return {
    purchaseOrders: listPurchaseOrders(),
    goodsReceipts: listGoodsReceipts(),
    poSequence,
    grnSequence,
  };
}
