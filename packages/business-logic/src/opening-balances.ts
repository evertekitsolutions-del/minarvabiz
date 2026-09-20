/**
 * Opening balances for first-time setup
 */
import type { UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import * as mainStore from "./store";
import * as phase5 from "./phase5-store";
import { openCashRegister } from "./cash-register";
import { planAutomaticPosting } from "./accounting-store";
import { remoteUpsertCustomer, remoteUpsertSupplier } from "./remote-write";

export function setOpeningCustomerBalance(customerId: UUID, amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { ok: false, error: "Opening customer balance must be a finite non-negative amount" };
  }
  const c = mainStore.getCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found" };
  const old = Number(c.outstandingBalance ?? 0);
  if (!Number.isFinite(old) || old < 0 || !Number.isSafeInteger(Math.round(old * 100))) {
    return { ok: false, error: "Customer balance needs reconciliation" };
  }
  const next = Math.round((amount + Number.EPSILON) * 100) / 100;
  const previous = Math.round((old + Number.EPSILON) * 100) / 100;
  const delta = Math.round((next - previous + Number.EPSILON) * 100) / 100;
  if (delta === 0) return { ok: true };
  const absolute = Math.abs(delta);
  const posting = planAutomaticPosting({
    referenceType: "auto_opening_customer",
    referenceId: "opening-customer-" + customerId + "-" + generateId(),
    date: nowISO(),
    description: "Opening customer balance adjustment: " + c.name,
    lines: delta > 0 ? [
      { key: "accounts_receivable", debit: absolute },
      { key: "opening_balance_equity", credit: absolute },
    ] : [
      { key: "opening_balance_equity", debit: absolute },
      { key: "accounts_receivable", credit: absolute },
    ],
  });
  if (posting.errors.length) return { ok: false, error: posting.errors.join("; ") };
  c.outstandingBalance = next;
  c.updatedAt = nowISO();
  posting.commit();
  void remoteUpsertCustomer({ ...c });
  auditAction("opening.customer_balance", "customers", customerId, { outstandingBalance: previous }, { outstandingBalance: next });
  touchPersistence();
  return { ok: true };
}

export function setOpeningSupplierBalance(supplierId: UUID, amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { ok: false, error: "Opening supplier balance must be a finite non-negative amount" };
  }
  const s = phase5.getSupplier(supplierId);
  if (!s) return { ok: false, error: "Supplier not found" };
  const old = Number(s.outstandingBalance ?? 0);
  if (!Number.isFinite(old) || old < 0 || !Number.isSafeInteger(Math.round(old * 100))) {
    return { ok: false, error: "Supplier balance needs reconciliation" };
  }
  const next = Math.round((amount + Number.EPSILON) * 100) / 100;
  const previous = Math.round((old + Number.EPSILON) * 100) / 100;
  const delta = Math.round((next - previous + Number.EPSILON) * 100) / 100;
  if (delta === 0) return { ok: true };
  const absolute = Math.abs(delta);
  const posting = planAutomaticPosting({
    referenceType: "auto_opening_supplier",
    referenceId: "opening-supplier-" + supplierId + "-" + generateId(),
    date: nowISO(),
    description: "Opening supplier balance adjustment: " + s.name,
    lines: delta > 0 ? [
      { key: "opening_balance_equity", debit: absolute },
      { key: "accounts_payable", credit: absolute },
    ] : [
      { key: "accounts_payable", debit: absolute },
      { key: "opening_balance_equity", credit: absolute },
    ],
  });
  if (posting.errors.length) return { ok: false, error: posting.errors.join("; ") };
  s.outstandingBalance = next;
  s.updatedAt = nowISO();
  posting.commit();
  void remoteUpsertSupplier({ ...s });
  auditAction("opening.supplier_balance", "suppliers", supplierId, { outstandingBalance: previous }, { outstandingBalance: next });
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
