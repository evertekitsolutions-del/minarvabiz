/**
 * Purchase returns to supplier — stock reduction + supplier balance.
 *
 * Accounting is conservative: source-posted returns reduce AP; older/unlinked
 * returns use legacy settlement clearing. The supplier credit is held in a
 * Purchase Returns Pending Review contra-asset until tax/cost classification is reviewed.
 */
import type { UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import { remoteUpsertSupplier } from "./remote-write";
import { planPurchaseReturnPosting } from "./procurement-accounting";
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
const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isSafeInteger(Math.round(input.quantity * 1000))) {
    return { record: null, error: "Quantity must be positive and finite" };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) {
    return { record: null, error: "Return amount must be positive and finite" };
  }
  const product = mainStore.getProduct(input.productId);
  if (!product) return { record: null, error: "Product not found" };
  if (!Number.isFinite(product.stockQuantity) || product.stockQuantity < input.quantity) {
    return { record: null, error: "Insufficient stock to return" };
  }
  const supplier = phase5.getSupplier(input.supplierId);
  if (!supplier) return { record: null, error: "Supplier not found" };
  if (!Number.isFinite(supplier.outstandingBalance) || !Number.isSafeInteger(Math.round(supplier.outstandingBalance * 100))) {
    return { record: null, error: "Supplier balance needs reconciliation" };
  }
  const amount = r2(input.amount);
  if (amount > r2(supplier.outstandingBalance)) {
    return { record: null, error: "Return amount exceeds supplier outstanding; supplier credit notes are not supported yet" };
  }
  if (input.purchaseId) {
    const purchase = phase5.listPurchases().find((candidate) => candidate.id === input.purchaseId);
    if (purchase && purchase.supplierId !== supplier.id) return { record: null, error: "Purchase does not belong to supplier" };
  }

  const record: PurchaseReturn = {
    id: generateId(),
    supplierId: supplier.id,
    purchaseId: input.purchaseId ?? null,
    productId: product.id,
    quantity: input.quantity,
    amount,
    reason: input.reason ?? null,
    createdAt: nowISO(),
  };
  const posting = planPurchaseReturnPosting({ id: record.id, purchaseId: record.purchaseId, amount: record.amount, createdAt: record.createdAt, branchId: product.branchId ?? null });
  if (posting.errors.length) return { record: null, error: posting.errors.join("; ") };

  mainStore.adjustStock(product.id, "stock_out", record.quantity, "purchase_return");
  supplier.outstandingBalance = r2(supplier.outstandingBalance - record.amount);
  supplier.updatedAt = nowISO();
  returns.push(record);
  enqueueOutbox("purchase_returns", record.id, "insert", record);
  void remoteUpsertSupplier({ ...supplier });
  posting.commit();
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
