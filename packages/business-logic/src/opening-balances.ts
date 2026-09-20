/**
 * Opening balances for first-time setup
 */
import type { UUID } from "@minarvabiz/types";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import * as mainStore from "./store";
import * as phase5 from "./phase5-store";
import { openCashRegister } from "./cash-register";
import { planAutomaticPosting } from "./accounting-store";

export function setOpeningCustomerBalance(customerId: UUID, amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  const c = mainStore.getCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found" };
  const old = c.outstandingBalance;
  c.outstandingBalance = amount;
  c.updatedAt = new Date().toISOString();
  auditAction("opening.customer_balance", "customers", customerId, { outstandingBalance: old }, { outstandingBalance: amount });
  touchPersistence();
  return { ok: true };
}

export function setOpeningSupplierBalance(supplierId: UUID, amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  const s = phase5.listSuppliers().find((x) => x.id === supplierId);
  if (!s) return { ok: false, error: "Supplier not found" };
  const old = s.outstandingBalance;
  s.outstandingBalance = amount;
  auditAction("opening.supplier_balance", "suppliers", supplierId, { outstandingBalance: old }, { outstandingBalance: amount });
  touchPersistence();
  return { ok: true };
}

export function setOpeningStock(productId: UUID, quantity: number): { ok: boolean; error?: string } {
  assertPermission("inventory.adjust");
  const p = mainStore.getProduct(productId);
  if (!p) return { ok: false, error: "Product not found" };
  const delta = quantity - p.stockQuantity;
  if (delta > 0) mainStore.adjustStock(productId, "stock_in", delta, "opening_balance");
  else if (delta < 0) mainStore.adjustStock(productId, "stock_out", -delta, "opening_balance");
  auditAction("opening.stock", "products", productId, { stock: p.stockQuantity }, { stock: quantity });
  return { ok: true };
}

export function setOpeningCash(amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { ok: false, error: "Opening cash must be a finite non-negative amount" };
  }
  const openingCash = Math.round((amount + Number.EPSILON) * 100) / 100;
  const businessDate = new Date().toISOString().slice(0, 10);
  const posting = planAutomaticPosting({
    referenceType: "auto_opening_cash",
    referenceId: "opening-cash-" + businessDate,
    date: businessDate,
    description: "Opening cash balance " + businessDate,
    lines: openingCash > 0 ? [
      { key: "cash", debit: openingCash },
      { key: "opening_balance_equity", credit: openingCash },
    ] : [],
  });
  if (posting.errors.length) return { ok: false, error: posting.errors.join("; ") };
  const r = openCashRegister(openingCash, businessDate);
  if (r.error) return { ok: false, error: r.error };
  posting.commit();
  auditAction("opening.cash", "cash_register", r.session!.id, null, { openingCash });
  return { ok: true };
}
