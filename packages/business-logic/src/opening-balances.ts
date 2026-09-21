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
import { getSystemAccount, listJournalEntries, planAutomaticPosting } from "./accounting-store";
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
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(Math.round(quantity * 1000))) {
    return { ok: false, error: "Opening stock quantity must be a finite non-negative quantity" };
  }
  const p = mainStore.getProduct(productId);
  if (!p) return { ok: false, error: "Product not found" };
  const previous = Number(p.stockQuantity);
  const unitCost = Number(p.costPrice);
  if (!Number.isFinite(previous) || previous < 0 || !Number.isSafeInteger(Math.round(previous * 1000))) {
    return { ok: false, error: "Product stock needs reconciliation" };
  }
  if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isSafeInteger(Math.round(unitCost * 100))) {
    return { ok: false, error: "Product cost needs reconciliation" };
  }
  const next = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
  const before = Math.round((previous + Number.EPSILON) * 1000) / 1000;
  const delta = Math.round((next - before + Number.EPSILON) * 1000) / 1000;
  if (delta === 0) return { ok: true };
  const value = Math.round((Math.abs(delta) * unitCost + Number.EPSILON) * 100) / 100;
  if (!Number.isSafeInteger(Math.round(value * 100))) {
    return { ok: false, error: "Opening stock value is out of range" };
  }
  const posting = planAutomaticPosting({
    referenceType: "auto_opening_stock",
    referenceId: "opening-stock-" + productId + "-" + generateId(),
    date: nowISO(),
    description: "Opening stock adjustment: " + p.name,
    branchId: p.branchId ?? null,
    lines: value > 0 ? (delta > 0 ? [
      { key: "inventory_asset", debit: value },
      { key: "opening_balance_equity", credit: value },
    ] : [
      { key: "opening_balance_equity", debit: value },
      { key: "inventory_asset", credit: value },
    ]) : [],
  });
  if (posting.errors.length) return { ok: false, error: posting.errors.join("; ") };
  const updated = delta > 0
    ? mainStore.adjustStock(productId, "stock_in", delta, "opening_balance")
    : mainStore.adjustStock(productId, "stock_out", -delta, "opening_balance");
  if (!updated) return { ok: false, error: "Opening stock adjustment failed" };
  posting.commit();
  auditAction("opening.stock", "products", productId, { stock: before }, { stock: next, unitCost, valueDelta: delta > 0 ? value : -value });
  return { ok: true };
}

export function setOpeningBank(amount: number): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { ok: false, error: "Opening bank balance must be a positive finite amount" };
  }
  const existingOpening = listJournalEntries().find((entry) =>
    entry.referenceType === "auto_opening_bank" && entry.referenceId === "opening-bank"
  );
  if (existingOpening) return { ok: false, error: "Opening bank balance has already been posted" };

  const bank = getSystemAccount("bank");
  if (bank) {
    const hasBankActivity = listJournalEntries().some((entry) =>
      entry.status === "posted"
      && entry.lines.some((line) => line.accountId === bank.id && (line.debit > 0 || line.credit > 0))
    );
    if (hasBankActivity) {
      return { ok: false, error: "Bank already has accounting activity; reconcile it before posting an opening balance" };
    }
  }

  const openingBank = Math.round((amount + Number.EPSILON) * 100) / 100;
  const businessDate = new Date().toISOString().slice(0, 10);
  const posting = planAutomaticPosting({
    referenceType: "auto_opening_bank",
    referenceId: "opening-bank",
    date: businessDate,
    description: "Opening bank balance " + businessDate,
    lines: [
      { key: "bank", debit: openingBank },
      { key: "opening_balance_equity", credit: openingBank },
    ],
  });
  if (posting.errors.length) return { ok: false, error: posting.errors.join("; ") };
  const journal = posting.commit();
  if (!journal) return { ok: false, error: "Opening bank posting did not create a journal" };
  auditAction("opening.bank", "journal_entries", journal.id, null, { openingBank, businessDate });
  touchPersistence();
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
