import { planPurchaseInvoicePosting, planPurchaseInvoiceCancellation } from "./procurement-accounting";
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
  PaymentMethod,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  SupplierPayableAging,
  UUID,
} from "@minarvabiz/types";
import {
  addMinorUnits,
  fromMinorUnits,
  generateId,
  multiplyMinorByQuantity,
  nowISO,
  percentOfMinor,
  subtractMinorUnits,
  toMinorUnits,
  toPercentBasisPoints,
  toQuantityMilli,
} from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { remoteUpsertGoodsReceipt, remoteUpsertPurchaseInvoice, remoteUpsertPurchaseOrder, remoteUpsertSupplier } from "./remote-write";
import * as phase5Store from "./phase5-store";
import * as mainStore from "./store";
import * as warehouseStore from "./warehouse-store";

const purchaseOrders: PurchaseOrder[] = [];
const goodsReceipts: GoodsReceipt[] = [];
const purchaseInvoices: PurchaseInvoice[] = [];
let poSequence = 0;
let grnSequence = 0;
let invoiceSequence = 0;

function r3(n: number): number {
  return toQuantityMilli(Number(n)) / 1000;
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

function nextInvoiceNumber(): string {
  invoiceSequence += 1;
  const year = new Date().getFullYear();
  return `PINV-${year}-${String(invoiceSequence).padStart(5, "0")}`;
}

function inferDocumentSequence(numbers: string[]): number {
  let max = 0;
  for (const number of numbers) {
    const match = /(\d+)$/.exec(number);
    if (!match) continue;
    const sequence = Number.parseInt(match[1] ?? "", 10);
    if (Number.isSafeInteger(sequence) && sequence > max) max = sequence;
  }
  return max;
}

function explicitSequence(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function cloneOrder(order: PurchaseOrder): PurchaseOrder {
  return { ...order, lines: order.lines.map((line) => ({ ...line })) };
}

function cloneReceipt(receipt: GoodsReceipt): GoodsReceipt {
  return { ...receipt, lines: receipt.lines.map((line) => ({ ...line })) };
}

function cloneInvoice(invoice: PurchaseInvoice): PurchaseInvoice {
  return { ...invoice, lines: invoice.lines.map((line) => ({ ...line })) };
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
    const rawTaxRate = item.taxRate == null ? 0 : Number(item.taxRate);
    const taxRate = toPercentBasisPoints(Math.max(0, rawTaxRate)) / 100;
    if (!description) errors.push("Every line needs a description or product");
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`${description || "Line"}: quantity must be greater than zero`);
    if (!Number.isFinite(unitCost) || unitCost < 0) errors.push(`${description || "Line"}: unit cost cannot be negative`);
    if (!Number.isFinite(rawTaxRate)) errors.push(`${description || "Line"}: tax rate must be a finite number`);
    const unitCostMinor = toMinorUnits(Math.max(0, unitCost));
    const baseMinor = multiplyMinorByQuantity(unitCostMinor, Math.max(0, quantity));
    const taxMinor = percentOfMinor(baseMinor, taxRate);
    const base = fromMinorUnits(baseMinor);
    const taxAmount = fromMinorUnits(taxMinor);
    normalized.push({
      id: generateId(),
      purchaseOrderId: "",
      productId: item.productId ?? null,
      description,
      orderedQuantity: r3(quantity),
      receivedQuantity: 0,
      unitCost: fromMinorUnits(toMinorUnits(unitCost)),
      taxRate,
      lineSubtotal: base,
      taxAmount,
      lineTotal: fromMinorUnits(addMinorUnits(baseMinor, taxMinor)),
    });
  }
  if (errors.length || !supplier) return { purchaseOrder: null, errors };

  const id = generateId();
  normalized.forEach((line) => { line.purchaseOrderId = id; });
  const subtotalMinor = addMinorUnits(...normalized.map((line) => toMinorUnits(line.lineSubtotal)));
  const taxMinor = addMinorUnits(...normalized.map((line) => toMinorUnits(line.taxAmount)));
  const subtotal = fromMinorUnits(subtotalMinor);
  const taxAmount = fromMinorUnits(taxMinor);
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
    total: fromMinorUnits(addMinorUnits(subtotalMinor, taxMinor)),
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

export function canEditPurchaseOrder(po: PurchaseOrder): boolean {
  return !po.deletedAt && po.status === "draft";
}

export function updatePurchaseOrder(id: UUID, input: {
  supplierId: UUID;
  expectedDeliveryDate?: string | null;
  lines: Array<{ productId?: UUID | null; description?: string; quantity: number; unitCost?: number; taxRate?: number }>;
  notes?: string | null;
}): { purchaseOrder: PurchaseOrder | null; errors: string[] } {
  assertPermission("purchases.manage");
  const po = findMutable(id);
  if (!po) return { purchaseOrder: null, errors: ["Purchase order not found"] };
  if (!canEditPurchaseOrder(po)) return { purchaseOrder: null, errors: ["Only draft purchase orders can be edited"] };
  const supplier = phase5Store.getSupplier(input.supplierId);
  const errors: string[] = [];
  if (!supplier) errors.push("Supplier is required");
  if (!input.lines.length) errors.push("Add at least one purchase-order line");
  const normalized: PurchaseOrderLine[] = [];
  for (const item of input.lines) {
    const product = item.productId ? mainStore.getProduct(item.productId) : undefined;
    const description = (item.description || product?.name || "").trim();
    const quantity = Number(item.quantity);
    const unitCost = item.unitCost == null ? Number(product?.costPrice || 0) : Number(item.unitCost);
    const rawTaxRate = item.taxRate == null ? 0 : Number(item.taxRate);
    const taxRate = toPercentBasisPoints(Math.max(0, rawTaxRate)) / 100;
    if (!description) errors.push("Every line needs a description or product");
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`${description || "Line"}: quantity must be greater than zero`);
    if (!Number.isFinite(unitCost) || unitCost < 0) errors.push(`${description || "Line"}: unit cost cannot be negative`);
    if (!Number.isFinite(rawTaxRate)) errors.push(`${description || "Line"}: tax rate must be a finite number`);
    const unitCostMinor = toMinorUnits(Math.max(0, unitCost));
    const baseMinor = multiplyMinorByQuantity(unitCostMinor, Math.max(0, quantity));
    const taxMinor = percentOfMinor(baseMinor, taxRate);
    normalized.push({
      id: generateId(),
      purchaseOrderId: po.id,
      productId: item.productId ?? null,
      description,
      orderedQuantity: r3(quantity),
      receivedQuantity: 0,
      unitCost: fromMinorUnits(unitCostMinor),
      taxRate,
      lineSubtotal: fromMinorUnits(baseMinor),
      taxAmount: fromMinorUnits(taxMinor),
      lineTotal: fromMinorUnits(addMinorUnits(baseMinor, taxMinor)),
    });
  }
  if (errors.length || !supplier) return { purchaseOrder: null, errors };
  const before = cloneOrder(po);
  const subtotalMinor = addMinorUnits(...normalized.map((line) => toMinorUnits(line.lineSubtotal)));
  const taxMinor = addMinorUnits(...normalized.map((line) => toMinorUnits(line.taxAmount)));
  po.supplierId = supplier.id;
  po.supplierName = supplier.name;
  po.expectedDeliveryDate = input.expectedDeliveryDate || null;
  po.lines = normalized;
  po.subtotal = fromMinorUnits(subtotalMinor);
  po.taxAmount = fromMinorUnits(taxMinor);
  po.total = fromMinorUnits(addMinorUnits(subtotalMinor, taxMinor));
  po.notes = input.notes?.trim() || null;
  po.updatedAt = nowISO();
  po.version += 1;
  void remoteUpsertPurchaseOrder(cloneOrder(po));
  auditAction("purchase_order.update", "purchase_orders", po.id, before, po);
  touchPersistence();
  return { purchaseOrder: cloneOrder(po), errors: [] };
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
  lines: Array<{ purchaseOrderLineId: UUID; quantity: number; warehouseLocationId?: UUID | null }>;
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
    const warehouseLocationId = item.warehouseLocationId ?? null;
    if (warehouseLocationId) {
      if (!poLine.productId) {
        errors.push(`${poLine.description}: warehouse location can only be used for a linked product`);
        continue;
      }
      const location = warehouseStore.listWarehouseLocations().find((candidate) => candidate.id === warehouseLocationId);
      if (!location) {
        errors.push(`${poLine.description}: warehouse location not found`);
        continue;
      }
      if (po.branchId) {
        const warehouse = warehouseStore.listWarehouses(true).find((candidate) => candidate.id === location.warehouseId);
        if (warehouse?.branchId && warehouse.branchId !== po.branchId) {
          errors.push(`${poLine.description}: warehouse location belongs to a different branch`);
          continue;
        }
      }
      const product = mainStore.getProduct(poLine.productId);
      const allocationErrors = warehouseStore.validateExistingStockAllocation({
        productId: poLine.productId,
        locationId: warehouseLocationId,
        quantity,
        productTotalStock: r3((product?.stockQuantity ?? 0) + quantity),
      });
      if (allocationErrors.length) {
        errors.push(`${poLine.description}: warehouse allocation failed — ${allocationErrors.join("; ")}`);
        continue;
      }
    }
    receiptLines.push({
      id: generateId(),
      goodsReceiptId: receiptId,
      purchaseOrderLineId: poLine.id,
      productId: poLine.productId ?? null,
      warehouseLocationId,
      description: poLine.description,
      receivedQuantity: quantity,
      unitCost: poLine.unitCost,
      lineTotal: fromMinorUnits(multiplyMinorByQuantity(toMinorUnits(poLine.unitCost), quantity)),
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
      if (receiptLine.warehouseLocationId) {
        const product = mainStore.getProduct(receiptLine.productId);
        const allocation = warehouseStore.allocateExistingStock({
          productId: receiptLine.productId,
          locationId: receiptLine.warehouseLocationId,
          quantity: receiptLine.receivedQuantity,
          productTotalStock: product?.stockQuantity ?? receiptLine.receivedQuantity,
        });
        if (allocation.errors.length) {
          throw new Error(`${receiptLine.description}: warehouse allocation failed — ${allocation.errors.join("; ")}`);
        }
      }
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
    subtotal: fromMinorUnits(addMinorUnits(...receiptLines.map((line) => toMinorUnits(line.lineTotal)))),
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


export function listPurchaseInvoices(supplierId?: UUID): PurchaseInvoice[] {
  return purchaseInvoices
    .filter((invoice) => !supplierId || invoice.supplierId === supplierId)
    .map(cloneInvoice)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPurchaseInvoice(id: UUID): PurchaseInvoice | undefined {
  const found = purchaseInvoices.find((invoice) => invoice.id === id);
  return found ? cloneInvoice(found) : undefined;
}

function mutableInvoice(id: UUID): PurchaseInvoice | undefined {
  return purchaseInvoices.find((invoice) => invoice.id === id);
}

function alreadyInvoicedQuantity(purchaseOrderLineId: UUID, excludeInvoiceId?: UUID): number {
  return r3(purchaseInvoices
    .filter((invoice) => invoice.status !== "cancelled" && invoice.id !== excludeInvoiceId)
    .flatMap((invoice) => invoice.lines)
    .filter((line) => line.purchaseOrderLineId === purchaseOrderLineId)
    .reduce((sum, line) => sum + line.invoicedQuantity, 0));
}

export function getInvoiceablePurchaseOrderLines(purchaseOrderId: UUID, excludeInvoiceId?: UUID) {
  const po = findMutable(purchaseOrderId);
  if (!po) return [];
  return po.lines.map((line) => ({
    purchaseOrderLineId: line.id,
    description: line.description,
    productId: line.productId ?? null,
    receivedQuantity: line.receivedQuantity,
    invoicedQuantity: alreadyInvoicedQuantity(line.id, excludeInvoiceId),
    invoiceableQuantity: r3(Math.max(0, line.receivedQuantity - alreadyInvoicedQuantity(line.id, excludeInvoiceId))),
    unitCost: line.unitCost,
    taxRate: line.taxRate,
  }));
}

export function createPurchaseInvoice(input: {
  purchaseOrderId: UUID;
  supplierInvoiceNumber?: string | null;
  invoiceDate?: string;
  dueDate?: string | null;
  lines: Array<{ purchaseOrderLineId: UUID; quantity: number; unitCost?: number; taxRate?: number }>;
  notes?: string | null;
  createdBy?: UUID | null;
}): { purchaseInvoice: PurchaseInvoice | null; errors: string[] } {
  assertPermission("purchases.manage");
  const po = findMutable(input.purchaseOrderId);
  if (!po) return { purchaseInvoice: null, errors: ["Purchase order not found"] };
  if (!["approved", "partially_received", "received"].includes(po.status)) {
    return { purchaseInvoice: null, errors: ["Purchase order must be approved before supplier invoicing"] };
  }
  const supplier = phase5Store.getSupplier(po.supplierId);
  if (!supplier) return { purchaseInvoice: null, errors: ["Supplier not found"] };
  const errors: string[] = [];
  const invoiceId = generateId();
  const seen = new Set<string>();
  const lines: PurchaseInvoiceLine[] = [];

  for (const item of input.lines) {
    if (seen.has(item.purchaseOrderLineId)) { errors.push("Duplicate purchase-order line in supplier invoice"); continue; }
    seen.add(item.purchaseOrderLineId);
    const poLine = po.lines.find((line) => line.id === item.purchaseOrderLineId);
    if (!poLine) { errors.push("Purchase-order line not found"); continue; }
    const available = r3(Math.max(0, poLine.receivedQuantity - alreadyInvoicedQuantity(poLine.id)));
    const quantity = r3(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) { errors.push(`${poLine.description}: invoice quantity must be greater than zero`); continue; }
    if (quantity > available) { errors.push(`${poLine.description}: cannot invoice ${quantity}; only ${available} received and uninvoiced`); continue; }
    const unitCost = fromMinorUnits(toMinorUnits(item.unitCost == null ? poLine.unitCost : Number(item.unitCost)));
    const rawTaxRate = item.taxRate == null ? poLine.taxRate : Number(item.taxRate);
    if (!Number.isFinite(unitCost) || unitCost < 0) { errors.push(`${poLine.description}: unit cost cannot be negative`); continue; }
    if (!Number.isFinite(rawTaxRate)) { errors.push(`${poLine.description}: tax rate must be a finite number`); continue; }
    const taxRate = toPercentBasisPoints(Math.max(0, rawTaxRate)) / 100;
    const lineSubtotalMinor = multiplyMinorByQuantity(toMinorUnits(unitCost), quantity);
    const taxAmountMinor = percentOfMinor(lineSubtotalMinor, taxRate);
    const lineSubtotal = fromMinorUnits(lineSubtotalMinor);
    const taxAmount = fromMinorUnits(taxAmountMinor);
    lines.push({
      id: generateId(),
      purchaseInvoiceId: invoiceId,
      purchaseOrderLineId: poLine.id,
      productId: poLine.productId ?? null,
      description: poLine.description,
      invoicedQuantity: quantity,
      unitCost,
      taxRate,
      lineSubtotal,
      taxAmount,
      lineTotal: fromMinorUnits(addMinorUnits(lineSubtotalMinor, taxAmountMinor)),
    });
  }
  if (errors.length || !lines.length) return { purchaseInvoice: null, errors: errors.length ? errors : ["Nothing to invoice"] };

  const subtotalMinor = addMinorUnits(...lines.map((line) => toMinorUnits(line.lineSubtotal)));
  const taxMinor = addMinorUnits(...lines.map((line) => toMinorUnits(line.taxAmount)));
  const subtotal = fromMinorUnits(subtotalMinor);
  const taxAmount = fromMinorUnits(taxMinor);
  const now = nowISO();
  const purchaseInvoice: PurchaseInvoice = {
    id: invoiceId,
    invoiceNumber: nextInvoiceNumber(),
    supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || null,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    status: "draft",
    invoiceDate: input.invoiceDate || now.slice(0, 10),
    dueDate: input.dueDate || null,
    lines,
    subtotal,
    taxAmount,
    total: fromMinorUnits(addMinorUnits(subtotalMinor, taxMinor)),
    paidAmount: 0,
    balanceAmount: fromMinorUnits(addMinorUnits(subtotalMinor, taxMinor)),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    branchId: po.branchId ?? null,
    createdBy: input.createdBy ?? null,
    version: 1,
  };
  purchaseInvoices.unshift(purchaseInvoice);
  void remoteUpsertPurchaseInvoice(cloneInvoice(purchaseInvoice));
  auditAction("purchase_invoice.create", "purchase_invoices", purchaseInvoice.id, null, purchaseInvoice);
  touchPersistence();
  return { purchaseInvoice: cloneInvoice(purchaseInvoice), errors: [] };
}

export function canEditPurchaseInvoice(invoice: PurchaseInvoice): boolean {
  return invoice.status === "draft";
}

export function updatePurchaseInvoice(id: UUID, input: {
  supplierInvoiceNumber?: string | null;
  invoiceDate?: string;
  dueDate?: string | null;
  lines: Array<{ purchaseOrderLineId: UUID; quantity: number; unitCost?: number; taxRate?: number }>;
  notes?: string | null;
}): { purchaseInvoice: PurchaseInvoice | null; errors: string[] } {
  assertPermission("purchases.manage");
  const invoice = mutableInvoice(id);
  if (!invoice) return { purchaseInvoice: null, errors: ["Purchase invoice not found"] };
  if (!canEditPurchaseInvoice(invoice)) return { purchaseInvoice: null, errors: ["Only draft supplier invoices can be edited"] };
  if (!invoice.purchaseOrderId) return { purchaseInvoice: null, errors: ["Supplier invoice is not linked to a purchase order"] };
  const po = findMutable(invoice.purchaseOrderId);
  if (!po) return { purchaseInvoice: null, errors: ["Purchase order not found"] };
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines: PurchaseInvoiceLine[] = [];
  for (const item of input.lines) {
    if (seen.has(item.purchaseOrderLineId)) { errors.push("Duplicate purchase-order line in supplier invoice"); continue; }
    seen.add(item.purchaseOrderLineId);
    const poLine = po.lines.find((line) => line.id === item.purchaseOrderLineId);
    if (!poLine) { errors.push("Purchase-order line not found"); continue; }
    const available = r3(Math.max(0, poLine.receivedQuantity - alreadyInvoicedQuantity(poLine.id, invoice.id)));
    const quantity = r3(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) { errors.push(`${poLine.description}: invoice quantity must be greater than zero`); continue; }
    if (quantity > available) { errors.push(`${poLine.description}: cannot invoice ${quantity}; only ${available} received and uninvoiced`); continue; }
    const unitCost = fromMinorUnits(toMinorUnits(item.unitCost == null ? poLine.unitCost : Number(item.unitCost)));
    const rawTaxRate = item.taxRate == null ? poLine.taxRate : Number(item.taxRate);
    if (!Number.isFinite(unitCost) || unitCost < 0) { errors.push(`${poLine.description}: unit cost cannot be negative`); continue; }
    if (!Number.isFinite(rawTaxRate)) { errors.push(`${poLine.description}: tax rate must be a finite number`); continue; }
    const taxRate = toPercentBasisPoints(Math.max(0, rawTaxRate)) / 100;
    const lineSubtotalMinor = multiplyMinorByQuantity(toMinorUnits(unitCost), quantity);
    const taxAmountMinor = percentOfMinor(lineSubtotalMinor, taxRate);
    lines.push({
      id: generateId(),
      purchaseInvoiceId: invoice.id,
      purchaseOrderLineId: poLine.id,
      productId: poLine.productId ?? null,
      description: poLine.description,
      invoicedQuantity: quantity,
      unitCost,
      taxRate,
      lineSubtotal: fromMinorUnits(lineSubtotalMinor),
      taxAmount: fromMinorUnits(taxAmountMinor),
      lineTotal: fromMinorUnits(addMinorUnits(lineSubtotalMinor, taxAmountMinor)),
    });
  }
  if (errors.length || !lines.length) return { purchaseInvoice: null, errors: errors.length ? errors : ["Nothing to invoice"] };
  const before = cloneInvoice(invoice);
  const subtotalMinor = addMinorUnits(...lines.map((line) => toMinorUnits(line.lineSubtotal)));
  const taxMinor = addMinorUnits(...lines.map((line) => toMinorUnits(line.taxAmount)));
  invoice.supplierInvoiceNumber = input.supplierInvoiceNumber?.trim() || null;
  invoice.invoiceDate = input.invoiceDate || invoice.invoiceDate;
  invoice.dueDate = input.dueDate || null;
  invoice.lines = lines;
  invoice.subtotal = fromMinorUnits(subtotalMinor);
  invoice.taxAmount = fromMinorUnits(taxMinor);
  invoice.total = fromMinorUnits(addMinorUnits(subtotalMinor, taxMinor));
  invoice.balanceAmount = invoice.total;
  invoice.notes = input.notes?.trim() || null;
  invoice.updatedAt = nowISO();
  invoice.version += 1;
  void remoteUpsertPurchaseInvoice(cloneInvoice(invoice));
  auditAction("purchase_invoice.update", "purchase_invoices", invoice.id, before, invoice);
  touchPersistence();
  return { purchaseInvoice: cloneInvoice(invoice), errors: [] };
}

export function postPurchaseInvoice(id: UUID): { purchaseInvoice: PurchaseInvoice | null; error?: string } {
  assertPermission("purchases.manage");
  const invoice = mutableInvoice(id);
  if (!invoice) return { purchaseInvoice: null, error: "Purchase invoice not found" };
  if (invoice.status !== "draft") return { purchaseInvoice: null, error: "Only draft supplier invoices can be posted" };
  const supplier = phase5Store.getSupplier(invoice.supplierId);
  if (!supplier) return { purchaseInvoice: null, error: "Supplier not found" };
  const posting = planPurchaseInvoicePosting(invoice);
  if (posting.errors.length) return { purchaseInvoice: null, error: posting.errors.join("; ") };
  const before = cloneInvoice(invoice);
  invoice.status = invoice.balanceAmount <= 0 ? "paid" : "posted";
  invoice.postedAt = nowISO();
  invoice.updatedAt = nowISO();
  invoice.version += 1;
  supplier.outstandingBalance = fromMinorUnits(addMinorUnits(
    toMinorUnits(supplier.outstandingBalance),
    toMinorUnits(invoice.balanceAmount)
  ));
  supplier.updatedAt = nowISO();
  posting.commit();
  void remoteUpsertPurchaseInvoice(cloneInvoice(invoice));
  void remoteUpsertSupplier(supplier);
  auditAction("purchase_invoice.post", "purchase_invoices", invoice.id, before, invoice);
  touchPersistence();
  return { purchaseInvoice: cloneInvoice(invoice) };
}

export function payPurchaseInvoice(input: {
  purchaseInvoiceId: UUID;
  amount: number;
  paymentMethod: PaymentMethod;
  date?: string;
  reference?: string | null;
  notes?: string | null;
}): { purchaseInvoice: PurchaseInvoice | null; error?: string } {
  assertPermission("purchases.manage");
  const invoice = mutableInvoice(input.purchaseInvoiceId);
  if (!invoice) return { purchaseInvoice: null, error: "Purchase invoice not found" };
  if (!["posted", "partially_paid"].includes(invoice.status)) return { purchaseInvoice: null, error: "Only posted unpaid invoices can receive payment" };
  const result = phase5Store.recordSupplierPayment({
    supplierId: invoice.supplierId, amount: input.amount, paymentMethod: input.paymentMethod,
    date: input.date, reference: input.reference || invoice.invoiceNumber,
    notes: input.notes || `Supplier invoice ${invoice.invoiceNumber}`, purchaseInvoiceId: invoice.id,
  });
  if (result.errors.length || !result.payment) return { purchaseInvoice: null, error: result.errors.join("; ") || "Unable to record supplier payment" };
  return { purchaseInvoice: cloneInvoice(invoice) };
}

/** Prepare all invoice balance changes before the supplier/payment mutation. */
export function prepareSupplierInvoiceSettlements(supplierId: UUID, allocations: Array<{ id: UUID; amount: number }>) {
  assertPermission("purchases.manage");
  const errors: string[] = [];
  const changes: Array<{ invoice: PurchaseInvoice; before: PurchaseInvoice; amount: number }> = [];
  const seen = new Set<string>();
  for (const allocation of allocations) {
    const invoice = mutableInvoice(allocation.id);
    if (!invoice || invoice.supplierId !== supplierId || !["posted", "partially_paid"].includes(invoice.status)
      || seen.has(allocation.id) || !Number.isFinite(allocation.amount) || allocation.amount <= 0 || allocation.amount > invoice.balanceAmount) {
      errors.push("Invalid supplier invoice settlement"); continue;
    }
    seen.add(allocation.id);
    changes.push({ invoice, before: cloneInvoice(invoice), amount: allocation.amount });
  }
  let committed = false;
  return { errors, commit: (): PurchaseInvoice[] => {
    if (errors.length || committed) return [];
    committed = true;
    for (const { invoice, before, amount } of changes) {
      const paidMinor = addMinorUnits(toMinorUnits(invoice.paidAmount), toMinorUnits(amount));
      const totalMinor = toMinorUnits(invoice.total);
      invoice.paidAmount = fromMinorUnits(paidMinor);
      invoice.balanceAmount = fromMinorUnits(Math.max(0, subtractMinorUnits(totalMinor, paidMinor)));
      invoice.status = invoice.balanceAmount === 0 ? "paid" : "partially_paid";
      invoice.updatedAt = nowISO(); invoice.version += 1;
      auditAction("purchase_invoice.payment", "purchase_invoices", invoice.id, before, invoice);
    }
    return changes.map(({ invoice }) => cloneInvoice(invoice));
  } };
}

export function cancelPurchaseInvoice(id: UUID, reason: string): { purchaseInvoice: PurchaseInvoice | null; error?: string } {
  assertPermission("purchases.manage");
  const invoice = mutableInvoice(id);
  if (!invoice) return { purchaseInvoice: null, error: "Purchase invoice not found" };
  const cancellationReason = reason.trim();
  if (cancellationReason.length < 3) return { purchaseInvoice: null, error: "Cancellation reason is required" };
  if (invoice.status === "cancelled") return { purchaseInvoice: null, error: "Purchase invoice already cancelled" };
  if (invoice.status === "paid" || invoice.status === "partially_paid" || invoice.paidAmount > 0) {
    return { purchaseInvoice: null, error: "Paid supplier invoice cannot be cancelled; use a debit note in the accounting workflow" };
  }
  const supplier = phase5Store.getSupplier(invoice.supplierId);
  if (invoice.status === "posted" && (!supplier || !Number.isFinite(supplier.outstandingBalance) || toMinorUnits(supplier.outstandingBalance) < toMinorUnits(invoice.balanceAmount))) return { purchaseInvoice: null, error: "Supplier balance needs reconciliation before cancellation" };
  const reversal = planPurchaseInvoiceCancellation(invoice);
  if (reversal.errors.length) return { purchaseInvoice: null, error: reversal.errors.join("; ") };
  const before = cloneInvoice(invoice);
  if (invoice.status === "posted" && supplier) {
    supplier.outstandingBalance = fromMinorUnits(Math.max(
      0,
      subtractMinorUnits(toMinorUnits(supplier.outstandingBalance), toMinorUnits(invoice.balanceAmount))
    ));
    supplier.updatedAt = nowISO();
    void remoteUpsertSupplier(supplier);
  }
  invoice.status = "cancelled";
  invoice.cancelledAt = nowISO();
  invoice.updatedAt = nowISO();
  invoice.version += 1;
  reversal.commit();
  void remoteUpsertPurchaseInvoice(cloneInvoice(invoice));
  auditAction("purchase_invoice.cancel", "purchase_invoices", invoice.id, before, { ...invoice, cancellationReason });
  touchPersistence();
  return { purchaseInvoice: cloneInvoice(invoice) };
}

export function buildSupplierPayableAging(asOfDate = new Date().toISOString().slice(0, 10)): SupplierPayableAging[] {
  const asOf = Date.parse(asOfDate + "T00:00:00Z");
  const bySupplier = new Map<string, SupplierPayableAging>();
  for (const invoice of purchaseInvoices) {
    if (!["posted", "partially_paid"].includes(invoice.status) || invoice.balanceAmount <= 0) continue;
    const due = Date.parse((invoice.dueDate || invoice.invoiceDate).slice(0, 10) + "T00:00:00Z");
    const overdueDays = Number.isFinite(due) ? Math.max(0, Math.floor((asOf - due) / 86400000)) : 0;
    const row = bySupplier.get(invoice.supplierId) || {
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName || invoice.supplierId,
      current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, totalOutstanding: 0,
    };
    const amountMinor = toMinorUnits(invoice.balanceAmount);
    if (overdueDays <= 0) row.current = fromMinorUnits(addMinorUnits(toMinorUnits(row.current), amountMinor));
    else if (overdueDays <= 30) row.days1to30 = fromMinorUnits(addMinorUnits(toMinorUnits(row.days1to30), amountMinor));
    else if (overdueDays <= 60) row.days31to60 = fromMinorUnits(addMinorUnits(toMinorUnits(row.days31to60), amountMinor));
    else if (overdueDays <= 90) row.days61to90 = fromMinorUnits(addMinorUnits(toMinorUnits(row.days61to90), amountMinor));
    else row.days90plus = fromMinorUnits(addMinorUnits(toMinorUnits(row.days90plus), amountMinor));
    row.totalOutstanding = fromMinorUnits(addMinorUnits(toMinorUnits(row.totalOutstanding), amountMinor));
    bySupplier.set(invoice.supplierId, row);
  }
  return [...bySupplier.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

export function cancelPurchaseOrder(id: UUID, reason: string): { purchaseOrder: PurchaseOrder | null; error?: string } {
  assertPermission("purchases.manage");
  const po = findMutable(id);
  if (!po) return { purchaseOrder: null, error: "Purchase order not found" };
  const cancellationReason = reason.trim();
  if (cancellationReason.length < 3) return { purchaseOrder: null, error: "Cancellation reason is required" };
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
  auditAction("purchase_order.cancel", "purchase_orders", po.id, before, { ...po, cancellationReason });
  touchPersistence();
  return { purchaseOrder: cloneOrder(po) };
}

export function hydrateProcurementState(input: {
  purchaseOrders?: PurchaseOrder[];
  goodsReceipts?: GoodsReceipt[];
  purchaseInvoices?: PurchaseInvoice[];
  poSequence?: number;
  grnSequence?: number;
  invoiceSequence?: number;
}) {
  if (input.purchaseOrders) {
    purchaseOrders.length = 0;
    purchaseOrders.push(...input.purchaseOrders.map(cloneOrder));
    poSequence = Math.max(
      explicitSequence(input.poSequence),
      inferDocumentSequence(input.purchaseOrders.map((po) => po.poNumber))
    );
  } else if (typeof input.poSequence === "number" && Number.isFinite(input.poSequence)) {
    poSequence = explicitSequence(input.poSequence);
  }

  if (input.goodsReceipts) {
    goodsReceipts.length = 0;
    goodsReceipts.push(...input.goodsReceipts.map(cloneReceipt));
    grnSequence = Math.max(
      explicitSequence(input.grnSequence),
      inferDocumentSequence(input.goodsReceipts.map((receipt) => receipt.grnNumber))
    );
  } else if (typeof input.grnSequence === "number" && Number.isFinite(input.grnSequence)) {
    grnSequence = explicitSequence(input.grnSequence);
  }

  if (input.purchaseInvoices) {
    purchaseInvoices.length = 0;
    purchaseInvoices.push(...input.purchaseInvoices.map(cloneInvoice));
    invoiceSequence = Math.max(
      explicitSequence(input.invoiceSequence),
      inferDocumentSequence(input.purchaseInvoices.map((invoice) => invoice.invoiceNumber))
    );
  } else if (typeof input.invoiceSequence === "number" && Number.isFinite(input.invoiceSequence)) {
    invoiceSequence = explicitSequence(input.invoiceSequence);
  }
}

export function exportProcurementState() {
  return {
    purchaseOrders: listPurchaseOrders(),
    goodsReceipts: listGoodsReceipts(),
    purchaseInvoices: listPurchaseInvoices(),
    poSequence,
    grnSequence,
    invoiceSequence,
  };
}
