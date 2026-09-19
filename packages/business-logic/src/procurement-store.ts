/**
 * Procurement foundation — Purchase Order lifecycle.
 *
 * Direct purchases remain in phase5-store. Purchase Orders are planning/control
 * documents and do not change stock or supplier balances until a Goods Receipt /
 * Purchase Invoice is posted in the next procurement step.
 */
import type { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { remoteUpsertGoodsReceipt, remoteUpsertPurchaseOrder } from "./remote-write";
import * as phase5Store from "./phase5-store";
import * as mainStore from "./store";
import * as warehouseStore from "./warehouse-store";

const purchaseOrders: PurchaseOrder[] = [];
const goodsReceipts: GoodsReceipt[] = [];
let poSequence = 0;
let grnSequence = 0;

function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
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
      orderedQuantity: r2(quantity),
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

export function listGoodsReceipts(purchaseOrderId?: UUID): GoodsReceipt[] {
  return goodsReceipts
    .filter((receipt) => !purchaseOrderId || receipt.purchaseOrderId === purchaseOrderId)
    .map((receipt) => ({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/**
 * Post a physical Goods Receipt against an approved PO.
 * This is the point where accounting stock increases. Supplier AP remains
 * untouched until the later Purchase Invoice step.
 */
export function receivePurchaseOrder(input: {
  purchaseOrderId: UUID;
  locationId?: UUID | null;
  lines: Array<{ purchaseOrderLineId: UUID; quantity: number }>;
  receivedAt?: string;
  notes?: string | null;
  receivedBy?: UUID | null;
}): { receipt: GoodsReceipt | null; purchaseOrder: PurchaseOrder | null; errors: string[] } {
  assertPermission("purchases.manage");
  const po = findMutable(input.purchaseOrderId);
  const errors: string[] = [];
  if (!po) return { receipt: null, purchaseOrder: null, errors: ["Purchase order not found"] };
  if (po.status !== "approved" && po.status !== "partially_received") {
    errors.push("Only approved or partially received purchase orders can receive goods");
  }
  if (!input.lines.length) errors.push("Add at least one received quantity");

  const location = input.locationId
    ? warehouseStore.listWarehouseLocations().find((candidate) => candidate.id === input.locationId)
    : undefined;
  if (input.locationId && !location) errors.push("Receiving warehouse location not found");

  const normalized: Array<{ poLine: PurchaseOrderLine; quantity: number }> = [];
  const seen = new Set<string>();
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
    const quantity = r2(Number(item.quantity));
    const remaining = r2(poLine.orderedQuantity - poLine.receivedQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`${poLine.description}: received quantity must be greater than zero`);
      continue;
    }
    if (quantity > remaining) {
      errors.push(`${poLine.description}: cannot receive more than remaining quantity ${remaining}`);
      continue;
    }
    if (poLine.productId && !mainStore.getProduct(poLine.productId)) {
      errors.push(`${poLine.description}: product no longer exists`);
      continue;
    }
    normalized.push({ poLine, quantity });
  }
  if (errors.length) return { receipt: null, purchaseOrder: cloneOrder(po), errors };

  const grnNumber = nextGrnNumber();
  const now = nowISO();
  const receiptId = generateId();
  const receiptLines: GoodsReceiptLine[] = [];

  for (const item of normalized) {
    const lineTotal = r2(item.quantity * item.poLine.unitCost);
    const receiptLine: GoodsReceiptLine = {
      id: generateId(),
      goodsReceiptId: receiptId,
      purchaseOrderLineId: item.poLine.id,
      productId: item.poLine.productId ?? null,
      description: item.poLine.description,
      quantity: item.quantity,
      unitCost: item.poLine.unitCost,
      lineTotal,
    };
    receiptLines.push(receiptLine);

    if (item.poLine.productId) {
      const updatedProduct = mainStore.adjustStock(
        item.poLine.productId,
        "stock_in",
        item.quantity,
        `${grnNumber} · ${po.poNumber}`
      );
      if (updatedProduct && input.locationId) {
        const allocation = warehouseStore.allocateExistingStock({
          productId: updatedProduct.id,
          locationId: input.locationId,
          quantity: item.quantity,
          productTotalStock: updatedProduct.stockQuantity,
        });
        if (allocation.errors.length) {
          throw new Error(`Warehouse allocation failed after validated receipt: ${allocation.errors.join("; ")}`);
        }
      }
    }
    item.poLine.receivedQuantity = r2(item.poLine.receivedQuantity + item.quantity);
  }

  const fullyReceived = po.lines.every((line) => r2(line.receivedQuantity) >= r2(line.orderedQuantity));
  po.status = fullyReceived ? "received" : "partially_received";
  po.updatedAt = now;
  po.version += 1;

  const receipt: GoodsReceipt = {
    id: receiptId,
    grnNumber,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName ?? null,
    locationId: input.locationId ?? null,
    lines: receiptLines,
    total: r2(receiptLines.reduce((sum, line) => sum + line.lineTotal, 0)),
    receivedAt: input.receivedAt || now,
    notes: input.notes ?? null,
    receivedBy: input.receivedBy ?? null,
    branchId: po.branchId ?? null,
    createdAt: now,
    version: 1,
  };
  goodsReceipts.push(receipt);
  void remoteUpsertPurchaseOrder(cloneOrder(po));
  void remoteUpsertGoodsReceipt({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) });
  auditAction("goods_receipt.create", "goods_receipts", receipt.id, null, {
    grnNumber: receipt.grnNumber,
    poNumber: po.poNumber,
    total: receipt.total,
    statusAfter: po.status,
    lines: receipt.lines,
  });
  touchPersistence();
  return {
    receipt: { ...receipt, lines: receipt.lines.map((line) => ({ ...line })) },
    purchaseOrder: cloneOrder(po),
    errors: [],
  };
}


export function hydrateProcurementState(input: { purchaseOrders?: PurchaseOrder[]; goodsReceipts?: GoodsReceipt[]; poSequence?: number; grnSequence?: number }) {
  if (input.purchaseOrders) {
    purchaseOrders.length = 0;
    purchaseOrders.push(...input.purchaseOrders.map(cloneOrder));
  }
  if (input.goodsReceipts) {
    goodsReceipts.length = 0;
    goodsReceipts.push(...input.goodsReceipts.map((receipt) => ({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) })));
  }
  if (typeof input.poSequence === "number") {
    poSequence = input.poSequence;
  } else if (input.purchaseOrders?.length) {
    poSequence = Math.max(
      0,
      ...input.purchaseOrders.map((po) => Number(/(\d+)$/.exec(po.poNumber)?.[1] || 0))
    );
  }
  if (typeof input.grnSequence === "number") {
    grnSequence = input.grnSequence;
  } else if (input.goodsReceipts?.length) {
    grnSequence = Math.max(
      0,
      ...input.goodsReceipts.map((receipt) => Number(/(\d+)$/.exec(receipt.grnNumber)?.[1] || 0))
    );
  }
}

export function exportProcurementState() {
  return { purchaseOrders: listPurchaseOrders(), goodsReceipts: listGoodsReceipts(), poSequence, grnSequence };
}
