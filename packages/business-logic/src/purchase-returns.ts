/**
 * Purchase returns to supplier — stock reduction + supplier balance
 */
import type { UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import * as mainStore from "./store";
import * as phase5 from "./phase5-store";
import { auditAction } from "./audit-actions";

export interface PurchaseReturn {
  id: UUID;
  supplierId: UUID;
  purchaseId?: UUID | null;
  productId: UUID;
  quantity: number;
  amount: number;
  reason?: string | null;
  createdAt: string;
}

const returns: PurchaseReturn[] = [];

export function listPurchaseReturns(): PurchaseReturn[] {
  return [...returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createPurchaseReturn(input: {
  supplierId: UUID;
  purchaseId?: UUID | null;
  productId: UUID;
  quantity: number;
  amount: number;
  reason?: string | null;
}): { record: PurchaseReturn | null; error?: string } {
  assertPermission("purchases.manage");
  if (input.quantity <= 0) return { record: null, error: "Quantity must be positive" };
  const product = mainStore.getProduct(input.productId);
  if (!product) return { record: null, error: "Product not found" };
  if (product.stockQuantity < input.quantity) {
    return { record: null, error: "Insufficient stock to return" };
  }
  mainStore.adjustStock(input.productId, "stock_out", input.quantity, "purchase_return");
  // Reduce supplier outstanding (we owe them less)
  const suppliers = phase5.listSuppliers();
  const sup = suppliers.find((s) => s.id === input.supplierId);
  if (sup) {
    sup.outstandingBalance = Math.max(0, (sup.outstandingBalance || 0) - input.amount);
  }
  const record: PurchaseReturn = {
    id: generateId(),
    supplierId: input.supplierId,
    purchaseId: input.purchaseId ?? null,
    productId: input.productId,
    quantity: input.quantity,
    amount: input.amount,
    reason: input.reason ?? null,
    createdAt: nowISO(),
  };
  returns.push(record);
  enqueueOutbox("purchase_returns", record.id, "insert", record);
  auditAction("purchase_return.create", "purchase_returns", record.id, null, record);
  touchPersistence();
  return { record };
}

export function hydratePurchaseReturns(data: { returns?: PurchaseReturn[] }) {
  if (data.returns) {
    returns.length = 0;
    returns.push(...data.returns);
  }
}

export function exportPurchaseReturnsState() {
  return { returns: [...returns] };
}
