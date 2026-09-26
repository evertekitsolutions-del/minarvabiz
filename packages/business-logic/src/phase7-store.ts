import { assertPermission, getCurrentRole } from "./permissions";
import { assertBusinessDayOpen } from "./business-day-state";
/**
 * Phase 7: Returns/refunds, audit logs, backup snapshots, report queries.
 */

import type {
  SaleReturn, SaleReturnItem, ReturnReason, PaymentMethod,
  AuditLogEntry, BackupMeta, SalesReportRow, UUID, Sale, CartLine,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { calculateInvoiceTotals } from "@minarvabiz/billing";
import { applyStockMovement } from "./inventory";
import { buildDayEndReport, type DayEndReport } from "./reports";
import { calculatePeriodSummary } from "./profit";
import * as mainStore from "./store";
import * as phase5Store from "./phase5-store";
import * as ordersStore from "./orders-store";
import * as phase6Store from "./phase6-store";
import { enqueueOutbox } from "./outbox-bridge";
import { touchPersistence } from "./autosave";
import { planReturnPosting, planSalePosting, planExchangeRefundPosting } from "./sales-accounting";
import { quoteSaleReturn } from "./return-value";

const returns: SaleReturn[] = [];
const auditLogs: AuditLogEntry[] = [];
const backups: BackupMeta[] = [];
const backupPayloads: Record<string, string> = {};
let lastReturnNo: string | null = null;

function audit(action: string, tableName?: string, recordId?: string, oldValue?: unknown, newValue?: unknown, userName?: string) {
  const role = getCurrentRole();
  const actor = userName ?? (role ? role.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "System");
  auditLogs.unshift({ id: generateId(), userName: actor, action, tableName: tableName ?? null, recordId: recordId ?? null,
    oldValue: oldValue != null ? JSON.stringify(oldValue) : null, newValue: newValue != null ? JSON.stringify(newValue) : null, createdAt: nowISO() });
}

function nextReturnNo(): string {
  const now = new Date();
  const dateKey = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let seq = 1;
  if (lastReturnNo) {
    const parts = lastReturnNo.split("-");
    const lastDate = parts.length >= 3 ? parts[1] : "";
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (lastDate === dateKey && !Number.isNaN(n)) seq = n + 1;
  }
  const num = `RET-${dateKey}-${String(seq).padStart(3, "0")}`;
  lastReturnNo = num;
  return num;
}

export function listReturns(): SaleReturn[] {
  return [...returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createReturn(input: {
  saleId: UUID; reason: ReturnReason; notes?: string | null; refundMethod: PaymentMethod;
  items: Array<{ saleItemId: UUID; productId: UUID; productName: string; quantity: number; unitPrice: number; restock: boolean }>;
  /** "credit" preserves paid value as internal exchange credit instead of emitting a refund Payment row. */
  refundMode?: "refund" | "credit";
}): { ret: SaleReturn | null; errors: string[]; paidRefund: number; receivableReduction: number } {
  assertPermission("returns.manage");
  assertBusinessDayOpen();
  const sale = mainStore.getSale(input.saleId);
  if (!sale) return { ret: null, errors: ["Sale not found"], paidRefund: 0, receivableReduction: 0 };
  if (!["cash", "card", "upi", "bank", "online", "other"].includes(input.refundMethod)) return { ret: null, errors: ["Invalid refund method"], paidRefund: 0, receivableReduction: 0 };
  const quote = quoteSaleReturn(sale, returns, input.items);
  if (quote.errors.length) return { ret: null, errors: quote.errors, paidRefund: 0, receivableReduction: 0 };
  const returnId = generateId();
  const returnItems: SaleReturnItem[] = quote.items.map(item => ({ ...item, id: generateId(), returnId }));
  const totalRefund = quote.totalRefund;

  const paidRefund = Math.min(totalRefund, Math.max(0, sale.paidAmount));
  const receivableReduction = Math.min(Math.max(0, totalRefund - paidRefund), Math.max(0, sale.balanceAmount));

  const ret: SaleReturn = {
    id: returnId, returnNumber: nextReturnNo(), saleId: sale.id, invoiceNumber: sale.invoiceNumber,
    customerId: sale.customerId, customerName: sale.customerName, reason: input.reason, notes: input.notes ?? null,
    totalRefund, refundMethod: input.refundMethod, status: "completed", resolution: input.refundMode === "credit" ? "exchange" : "refund", items: returnItems, createdAt: nowISO(), version: 1,
  };
  const accountingPlan = planReturnPosting(sale, ret, returns, paidRefund, receivableReduction);
  if (accountingPlan.errors.length) return { ret: null, errors: accountingPlan.errors, paidRefund: 0, receivableReduction: 0 };

  for (const item of returnItems) {
    if (item.restock) {
      const p = mainStore.getProduct(item.productId);
      if (p) {
        p.stockQuantity = applyStockMovement(p.stockQuantity, "return", item.quantity);
        p.updatedAt = nowISO();
        enqueueOutbox("products", p.id, "update", p);
      }
    }
  }

  const oldSale = { ...sale };
  sale.total = Math.max(0, Math.round((sale.total - totalRefund) * 100) / 100);
  sale.paidAmount = Math.max(0, Math.round((sale.paidAmount - paidRefund) * 100) / 100);
  sale.balanceAmount = Math.max(0, Math.round((sale.balanceAmount - receivableReduction) * 100) / 100);
  sale.status = sale.total === 0 ? "returned" : "partial";
  sale.updatedAt = nowISO();
  sale.version = (sale.version ?? 1) + 1;

  let updatedCustomer: ReturnType<typeof mainStore.getCustomer> = undefined;
  if (sale.customerId) {
    const c = mainStore.getCustomer(sale.customerId);
    if (c) {
      c.totalSpending = Math.max(0, Math.round((c.totalSpending - paidRefund) * 100) / 100);
      c.outstandingBalance = Math.max(0, Math.round((c.outstandingBalance - receivableReduction) * 100) / 100);
      c.updatedAt = nowISO();
      updatedCustomer = c;
    }
  }

  returns.push(ret);
  accountingPlan.commit();

  const refundPayment = input.refundMode === "credit" ? null : mainStore.recordRefundPayment({
    returnId: ret.id,
    saleId: sale.id,
    customerId: sale.customerId,
    amount: paidRefund,
    method: input.refundMethod,
    notes: `Refund ${ret.returnNumber} for invoice ${sale.invoiceNumber}`,
  });

  enqueueOutbox("returns", ret.id, "insert", ret);
  enqueueOutbox("sales", sale.id, "update", sale);
  if (updatedCustomer) enqueueOutbox("customers", updatedCustomer.id, "update", updatedCustomer);

  audit("sale.return", "returns", ret.id, oldSale, { returnNumber: ret.returnNumber, invoiceNumber: sale.invoiceNumber,
    totalRefund, paidRefund, receivableReduction, refundPaymentId: refundPayment?.id ?? null, refundMethod: input.refundMethod, refundMode: input.refundMode ?? "refund" });

  phase6Store.pushNotification({
    kind: "system",
    title: input.refundMode === "credit" ? "Exchange return processed" : "Return processed",
    body: `${ret.returnNumber} ${input.refundMode === "credit" ? "exchange credit" : "refund"} ${totalRefund} for ${sale.invoiceNumber}`,
    href: "/returns",
  });
  touchPersistence();
  return { ret, errors: [], paidRefund, receivableReduction };
}


export function createExchange(input: {
  saleId: UUID;
  reason: ReturnReason;
  notes?: string | null;
  returnItems: Array<{ saleItemId: UUID; productId: UUID; productName: string; quantity: number; unitPrice: number; restock: boolean }>;
  replacementLines: CartLine[];
  paymentMethod: PaymentMethod;
  additionalPaidAmount: number;
  refundMethod: PaymentMethod;
}): {
  ret: SaleReturn | null;
  replacementSale: Sale | null;
  storeCreditApplied: number;
  extraRefund: number;
  amountDue: number;
  errors: string[];
} {
  assertPermission("returns.manage");
  assertBusinessDayOpen();
  assertPermission("sales.create");
  const original = mainStore.getSale(input.saleId);
  const errors: string[] = [];
  if (!original) errors.push("Original sale not found");
  if (!input.returnItems.length) errors.push("Select at least one item to return");
  if (!input.replacementLines.length) errors.push("Add at least one replacement item");
  if (errors.length || !original) {
    return { ret: null, replacementSale: null, storeCreditApplied: 0, extraRefund: 0, amountDue: 0, errors };
  }

  const quote = quoteSaleReturn(original, returns, input.returnItems);
  errors.push(...quote.errors);
  const restockByProduct = new Map<UUID, number>();
  const returnValue = quote.totalRefund;
  for (const item of quote.items) {
    if (item.restock) restockByProduct.set(item.productId, (restockByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  if (!Number.isFinite(input.additionalPaidAmount) || input.additionalPaidAmount < 0) errors.push("Invalid additional payment");

  for (const line of input.replacementLines) {
    const live = mainStore.getProduct(line.productId);
    if (!live) { errors.push(`Replacement product not found: ${line.productName}`); continue; }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) errors.push(`${line.productName}: quantity must be greater than zero`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) errors.push(`${line.productName}: invalid selling price`);
    const projected = live.stockQuantity + (restockByProduct.get(live.id) ?? 0);
    if (line.quantity > projected) errors.push(`${live.name}: insufficient replacement stock (available after return ${projected})`);
  }
  if (errors.length) {
    return { ret: null, replacementSale: null, storeCreditApplied: 0, extraRefund: 0, amountDue: 0, errors };
  }

  const paidCreditAvailable = Math.round(Math.min(returnValue, Math.max(0, original.paidAmount)) * 100) / 100;
  const replacementTotals = calculateInvoiceTotals({
    items: input.replacementLines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
    })),
  });
  const replacementTotal = replacementTotals.grandTotal;
  const storeCreditApplied = Math.round(Math.min(paidCreditAvailable, replacementTotal) * 100) / 100;
  const extraRefund = Math.round(Math.max(0, paidCreditAvailable - storeCreditApplied) * 100) / 100;
  const amountDue = Math.round(Math.max(0, replacementTotal - storeCreditApplied) * 100) / 100;
  const additionalPaid = Math.round(Math.max(0, input.additionalPaidAmount) * 100) / 100;
  if (additionalPaid > amountDue) {
    return {
      ret: null, replacementSale: null, storeCreditApplied, extraRefund, amountDue,
      errors: [`Additional payment cannot exceed amount due (${amountDue.toFixed(2)})`],
    };
  }

  // Preflight replacement accounting before changing the returned invoice.
  const replacementPreview: Sale = {
    ...original, id: generateId(), invoiceNumber: "Exchange preview", saleDate: nowISO(),
    total: replacementTotal, taxAmount: replacementTotals.itemsTax, paidAmount: Math.round((storeCreditApplied + additionalPaid) * 100) / 100,
    balanceAmount: Math.round((amountDue - additionalPaid) * 100) / 100,
    items: input.replacementLines.map(line => ({ ...line, id: generateId(), saleId: "preview", lineTotal: calculateInvoiceTotals({ items: [line] }).grandTotal })),
  };
  const previewPlan = planSalePosting(replacementPreview, [{ method: input.paymentMethod, amount: additionalPaid }], storeCreditApplied);
  const excessPlan = planExchangeRefundPosting(generateId(), extraRefund, input.refundMethod);
  if (previewPlan.errors.length || excessPlan.errors.length) return { ret: null, replacementSale: null, storeCreditApplied, extraRefund, amountDue, errors: [...previewPlan.errors, ...excessPlan.errors] };

  // Validation above is intentionally completed before mutating the original sale/stock.
  const returned = createReturn({
    saleId: original.id,
    reason: input.reason,
    notes: [input.notes, "Exchange"].filter(Boolean).join(" · "),
    refundMethod: input.refundMethod,
    items: input.returnItems,
    refundMode: "credit",
  });
  if (!returned.ret || returned.errors.length) {
    return { ret: null, replacementSale: null, storeCreditApplied: 0, extraRefund: 0, amountDue, errors: returned.errors };
  }

  const replacement = mainStore.createSale({
    customerId: original.customerId,
    lines: input.replacementLines,
    paidAmount: additionalPaid,
    paymentMethod: input.paymentMethod,
    creditAmount: storeCreditApplied,
    notes: `Exchange for ${original.invoiceNumber}; return ${returned.ret.returnNumber}${input.notes ? ` · ${input.notes}` : ""}`,
  });
  if (replacement.errors.length || !replacement.sale) {
    // This path should only be reachable for a new synchronous validation failure after the preflight checks.
    audit("sale.exchange.failed_after_return", "returns", returned.ret.id, null, { errors: replacement.errors });
    return { ret: returned.ret, replacementSale: null, storeCreditApplied, extraRefund, amountDue, errors: replacement.errors.length ? replacement.errors : ["Replacement sale failed"] };
  }

  returned.ret.resolution = "exchange";
  returned.ret.exchangeSaleId = replacement.sale.id;
  returned.ret.exchangeInvoiceNumber = replacement.sale.invoiceNumber;
  returned.ret.storeCreditApplied = storeCreditApplied;
  enqueueOutbox("returns", returned.ret.id, "update", returned.ret);

  planExchangeRefundPosting(returned.ret.id, extraRefund, input.refundMethod).commit();
  let extraRefundPaymentId: string | null = null;
  if (extraRefund > 0) {
    const extraPayment = mainStore.recordRefundPayment({
      returnId: returned.ret.id,
      saleId: original.id,
      customerId: original.customerId,
      amount: extraRefund,
      method: input.refundMethod,
      notes: `Exchange excess credit refund ${returned.ret.returnNumber}`,
    });
    extraRefundPaymentId = extraPayment?.id ?? null;
  }

  audit("sale.exchange", "returns", returned.ret.id, null, {
    originalInvoice: original.invoiceNumber,
    replacementInvoice: replacement.sale.invoiceNumber,
    returnValue,
    paidCreditAvailable,
    storeCreditApplied,
    additionalPaid,
    amountDue,
    extraRefund,
    extraRefundPaymentId,
  });
  phase6Store.pushNotification({
    kind: "system",
    title: "Exchange completed",
    body: `${original.invoiceNumber} exchanged to ${replacement.sale.invoiceNumber}; credit ${storeCreditApplied.toFixed(2)}`,
    href: "/returns",
  });
  touchPersistence();
  return { ret: returned.ret, replacementSale: replacement.sale, storeCreditApplied, extraRefund, amountDue, errors: [] };
}

export function listAuditLogs(limit = 100): AuditLogEntry[] { return auditLogs.slice(0, limit); }
export function recordAudit(action: string, tableName?: string, recordId?: string, oldValue?: unknown, newValue?: unknown) {
  audit(action, tableName, recordId, oldValue, newValue);
  touchPersistence();
}

export function createBackup(kind: "manual" | "automatic" = "manual"): BackupMeta {
  const snapshot = { version: 1, createdAt: nowISO(), customers: mainStore.listCustomers(), products: mainStore.listProducts(),
    categories: mainStore.listCategories(), sales: mainStore.listSales(), payments: mainStore.listPayments(), orders: ordersStore.listOrders(),
    laundry: phase5Store.listLaundryOrders(), expenses: phase5Store.listExpenses(), purchases: phase5Store.listPurchases(),
    suppliers: phase5Store.listSuppliers(), staff: phase6Store.listStaff(), returns: listReturns(), audit: listAuditLogs(500) };
  const json = JSON.stringify(snapshot);
  assertPermission("backup.manage");
  const id = generateId();
  const filename = `minarvabiz-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  backupPayloads[id] = json;
  const meta: BackupMeta = { id, filename, createdAt: nowISO(), sizeBytes: new TextEncoder().encode(json).length, kind, verified: true, location: "local" };
  backups.unshift(meta);
  audit("backup.created", "backups", id, null, { filename, sizeBytes: meta.sizeBytes });
  touchPersistence();
  return meta;
}

export function listBackups(): BackupMeta[] { return [...backups]; }
export function getBackupPayload(id: UUID): string | null { return backupPayloads[id] ?? null; }
export function verifyBackup(id: UUID): boolean {
  const payload = backupPayloads[id];
  if (!payload) return false;
  try { const data = JSON.parse(payload); const ok = data && typeof data === "object" && data.version === 1;
    const meta = backups.find((b) => b.id === id); if (meta) meta.verified = ok; if (meta) touchPersistence(); return ok; } catch { return false; }
}

export function inspectBackup(id: UUID): { ok: boolean; summary?: Record<string, number>; error?: string } {
  const payload = backupPayloads[id];
  if (!payload) return { ok: false, error: "Backup not found" };
  try { const data = JSON.parse(payload); return { ok: true, summary: { customers: data.customers?.length ?? 0, products: data.products?.length ?? 0,
    sales: data.sales?.length ?? 0, orders: data.orders?.length ?? 0, expenses: data.expenses?.length ?? 0 } }; }
  catch { return { ok: false, error: "Corrupt backup file" }; }
}

export function salesReport(from?: string, to?: string): SalesReportRow[] {
  const sales = mainStore.listSales(), orders = ordersStore.listOrders(), laundry = phase5Store.listLaundryOrders(), expenses = phase5Store.listExpenses();
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to);

  const periodSales = sales.filter((s) => inRange(s.saleDate) && s.status !== "cancelled");
  const periodOrders = orders.filter((o) => inRange(o.orderDate) && o.status !== "cancelled");
  const periodLaundry = laundry.filter((l) => inRange(l.createdAt) && l.status !== "cancelled");
  const periodExpenses = expenses.filter((e) => inRange(e.date));
  const periodIncentives = phase6Store.listIncentivePayouts().filter((p) => inRange(p.calculatedAt));

  const productSales = periodSales.reduce((a, s) => a + s.total, 0);
  const inventoryCogs = periodSales.reduce((a, s) => a + s.items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0), 0);
  const serviceRevenue = periodOrders.reduce((a, o) => a + o.price, 0);
  const laundryRevenue = periodLaundry.reduce((a, l) => a + l.totalCustomerCharge, 0);
  const orderMaterialCosts = periodOrders.reduce((a, o) => a + o.externalMaterialCost, 0)
    + periodLaundry.reduce((a, l) => a + l.totalSupplierCost, 0);
  const orderSpecificExpenses = periodOrders.reduce((a, o) => a + o.orderExpensesTotal, 0)
    + periodExpenses.filter((e) => Boolean(e.orderId)).reduce((a, e) => a + e.amount, 0);
  const generalExpenses = periodExpenses.filter((e) => !e.orderId).reduce((a, e) => a + e.amount, 0);
  const staffIncentives = periodIncentives.reduce((a, p) => a + p.amount, 0);

  const summary = calculatePeriodSummary({
    productSalesRevenue: productSales,
    serviceRevenue: serviceRevenue + laundryRevenue,
    inventoryCostOfGoods: inventoryCogs,
    orderMaterialCosts,
    orderSpecificExpenses,
    generalExpenses,
    staffIncentives,
  });
  const expensesTotal = summary.totalCostOfGoods + summary.totalOperatingExpenses;
  return [{
    label: "Period",
    productSales,
    serviceRevenue,
    laundryRevenue,
    totalRevenue: summary.totalRevenue,
    expenses: expensesTotal,
    netProfit: summary.netProfit,
  }];
}

export function dayEndReport(): DayEndReport {
  const localDate = (value: string): string => {
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10);
    const offset = parsed.getTimezoneOffset() * 60_000;
    return new Date(parsed.getTime() - offset).toISOString().slice(0, 10);
  };
  const today = localDate(new Date().toISOString());
  const sales = mainStore.listSales().filter((s) => localDate(s.saleDate) === today && s.status !== "cancelled");
  const orders = ordersStore.listOrders().filter((o) => localDate(o.orderDate) === today && o.status !== "cancelled");
  const laundry = phase5Store.listLaundryOrders().filter((l) => localDate(l.createdAt) === today && l.status !== "cancelled");
  const expenses = phase5Store.listExpenses().filter((e) => localDate(e.date) === today);
  const payments = mainStore.listPayments().filter((p) => localDate(p.paidAt) === today);

  const productSales = sales.reduce((a, s) => a + s.total, 0);
  const cogs = sales.reduce((a, s) => a + s.items.reduce((x, i) => x + i.quantity * i.costPrice, 0), 0);
  const serviceRevenue = orders.reduce((a, o) => a + o.price, 0);
  const orderMat = orders.reduce((a, o) => a + o.externalMaterialCost, 0);
  const orderExp = orders.reduce((a, o) => a + o.orderExpensesTotal, 0);
  const laundryRevenue = laundry.reduce((a, l) => a + l.totalCustomerCharge, 0);
  const generalExp = expenses.filter((e) => !e.orderId).reduce((a, e) => a + e.amount, 0);
  const staffIncentives = phase6Store.listIncentivePayouts()
    .filter((p) => localDate(p.calculatedAt) === today)
    .reduce((a, p) => a + p.amount, 0);

  const inflow = (method: PaymentMethod) => payments.filter((p) => p.method === method && p.referenceType !== "refund").reduce((a, p) => a + p.amount, 0);
  const refundOutflow = (method: PaymentMethod) => payments.filter((p) => p.method === method && p.referenceType === "refund").reduce((a, p) => a + p.amount, 0);
  const cash = inflow("cash") - refundOutflow("cash");
  const card = inflow("card") + inflow("upi") - refundOutflow("card") - refundOutflow("upi");
  const other = inflow("bank") + inflow("other") + inflow("online") - refundOutflow("bank") - refundOutflow("other") - refundOutflow("online");

  const outstanding = sales.reduce((a, s) => a + s.balanceAmount, 0) + orders.reduce((a, o) => a + o.balance, 0);
  return buildDayEndReport({ productSales, serviceRevenue, laundryRevenue, costOfGoods: cogs, orderMaterialCosts: orderMat,
    orderSpecificExpenses: orderExp, generalExpenses: generalExp, staffIncentives, cashReceived: cash,
    cardPayments: card, otherPayments: other, outstandingAmount: outstanding });
}

export function stockReport() {
  return mainStore.listProducts().map((p) => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stockQuantity, min: p.minimumStock,
    value: Math.round(p.stockQuantity * p.costPrice * 100) / 100, low: p.stockQuantity <= p.minimumStock }));
}

export function outstandingPaymentsReport() {
  return mainStore.listCustomers().filter((c) => c.outstandingBalance > 0).map((c) => ({ id: c.id, name: c.name, phone: c.phone, outstanding: c.outstandingBalance }));
}

export function listSalesForReturn(): Sale[] { return mainStore.listSales().filter((s) => s.status === "completed" || s.status === "partial"); }

export function hydratePhase7(data: { returns?: SaleReturn[]; auditLogs?: AuditLogEntry[] }) {
  if (data.returns) { returns.length = 0; returns.push(...data.returns); }
  if (data.auditLogs) { auditLogs.length = 0; auditLogs.push(...data.auditLogs); }
}
