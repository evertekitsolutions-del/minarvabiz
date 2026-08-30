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
  const r = openCashRegister(amount);
  if (r.error) return { ok: false, error: r.error };
  auditAction("opening.cash", "cash_register", r.session!.id, null, { openingCash: amount });
  return { ok: true };
}
