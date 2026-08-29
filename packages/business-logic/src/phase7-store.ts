/**
 * Phase 7: Returns/refunds, audit logs, backup snapshots, report queries.
 */

import type {
  SaleReturn, SaleReturnItem, ReturnReason, PaymentMethod,
  AuditLogEntry, BackupMeta, SalesReportRow, UUID, Sale,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { applyStockMovement } from "./inventory";
import { buildDayEndReport, type DayEndReport } from "./reports";
import * as mainStore from "./store";
import * as phase5Store from "./phase5-store";
import * as ordersStore from "./orders-store";
import * as phase6Store from "./phase6-store";

const returns: SaleReturn[] = [];
const auditLogs: AuditLogEntry[] = [];
const backups: BackupMeta[] = [];
const backupPayloads: Record<string, string> = {};
let lastReturnNo: string | null = null;

function audit(
  action: string,
  tableName?: string,
  recordId?: string,
  oldValue?: unknown,
  newValue?: unknown,
  userName = "Admin"
) {
  auditLogs.unshift({
    id: generateId(),
    userName,
    action,
    tableName: tableName ?? null,
    recordId: recordId ?? null,
    oldValue: oldValue != null ? JSON.stringify(oldValue) : null,
    newValue: newValue != null ? JSON.stringify(newValue) : null,
    createdAt: nowISO(),
  });
}

function nextReturnNo(): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const d = String(new Date().getDate()).padStart(2, "0");
  let seq = 1;
  if (lastReturnNo) {
    const parts = lastReturnNo.split("-");
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  const num = `RET-${y}${m}${d}-${String(seq).padStart(3, "0")}`;
  lastReturnNo = num;
  return num;
}

// ---- Returns & refunds ----
export function listReturns(): SaleReturn[] {
  return [...returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createReturn(input: {
  saleId: UUID;
  reason: ReturnReason;
  notes?: string | null;
  refundMethod: PaymentMethod;
  items: Array<{
    saleItemId: UUID;
    productId: UUID;
    productName: string;
    quantity: number;
    unitPrice: number;
    restock: boolean;
  }>;
}): { ret: SaleReturn | null; errors: string[] } {
  const sale = mainStore.getSale(input.saleId);
  if (!sale) return { ret: null, errors: ["Sale not found"] };
  if (input.items.length === 0) return { ret: null, errors: ["Select at least one item"] };

  const errors: string[] = [];
  for (const item of input.items) {
    const orig = sale.items.find((i) => i.id === item.saleItemId);
    if (!orig) {
      errors.push(`Item ${item.productName} not on sale`);
      continue;
    }
    if (item.quantity <= 0 || item.quantity > orig.quantity) {
      errors.push(`${item.productName}: invalid quantity`);
    }
  }
  if (errors.length) return { ret: null, errors };

  const returnId = generateId();
  const returnItems: SaleReturnItem[] = input.items.map((item) => ({
    id: generateId(),
    returnId,
    saleItemId: item.saleItemId,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    refundAmount: Math.round(item.quantity * item.unitPrice * 100) / 100,
    restock: item.restock,
  }));

  const totalRefund = returnItems.reduce((s, i) => s + i.refundAmount, 0);

  // Restock
  for (const item of returnItems) {
    if (item.restock) {
      const p = mainStore.getProduct(item.productId);
      if (p) {
        p.stockQuantity = applyStockMovement(p.stockQuantity, "return", item.quantity);
        p.updatedAt = nowISO();
      }
    }
  }

  // Adjust customer outstanding / spending
  if (sale.customerId) {
    const c = mainStore.getCustomer(sale.customerId);
    if (c) {
      c.totalSpending = Math.max(0, Math.round((c.totalSpending - totalRefund) * 100) / 100);
      c.updatedAt = nowISO();
    }
  }

  const ret: SaleReturn = {
    id: returnId,
    returnNumber: nextReturnNo(),
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    customerId: sale.customerId,
    customerName: sale.customerName,
    reason: input.reason,
    notes: input.notes ?? null,
    totalRefund,
    refundMethod: input.refundMethod,
    status: "completed",
    items: returnItems,
    createdAt: nowISO(),
    version: 1,
  };
  returns.push(ret);

  audit("sale.return", "returns", ret.id, null, {
    returnNumber: ret.returnNumber,
    invoiceNumber: sale.invoiceNumber,
    totalRefund,
  });

  phase6Store.pushNotification({
    kind: "system",
    title: "Return processed",
    body: `${ret.returnNumber} refund ${totalRefund} for ${sale.invoiceNumber}`,
    href: "/returns",
  });

  return { ret, errors: [] };
}

// ---- Audit ----
export function listAuditLogs(limit = 100): AuditLogEntry[] {
  return auditLogs.slice(0, limit);
}

export function recordAudit(
  action: string,
  tableName?: string,
  recordId?: string,
  oldValue?: unknown,
  newValue?: unknown
) {
  audit(action, tableName, recordId, oldValue, newValue);
}

// ---- Backup / restore ----
export function createBackup(kind: "manual" | "automatic" = "manual"): BackupMeta {
  const snapshot = {
    version: 1,
    createdAt: nowISO(),
    customers: mainStore.listCustomers(),
    products: mainStore.listProducts(),
    categories: mainStore.listCategories(),
    sales: mainStore.listSales(),
    payments: mainStore.listPayments(),
    orders: ordersStore.listOrders(),
    laundry: phase5Store.listLaundryOrders(),
    expenses: phase5Store.listExpenses(),
    purchases: phase5Store.listPurchases(),
    suppliers: phase5Store.listSuppliers(),
    staff: phase6Store.listStaff(),
    returns: listReturns(),
    audit: listAuditLogs(500),
  };
  const json = JSON.stringify(snapshot);
  const id = generateId();
  const filename = `minarvabiz-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  backupPayloads[id] = json;
  const meta: BackupMeta = {
    id,
    filename,
    createdAt: nowISO(),
    sizeBytes: new TextEncoder().encode(json).length,
    kind,
    verified: true,
    location: "local",
  };
  backups.unshift(meta);
  // Never auto-delete the only backup
  audit("backup.created", "backups", id, null, { filename, sizeBytes: meta.sizeBytes });
  return meta;
}

export function listBackups(): BackupMeta[] {
  return [...backups];
}

export function getBackupPayload(id: UUID): string | null {
  return backupPayloads[id] ?? null;
}

export function verifyBackup(id: UUID): boolean {
  const payload = backupPayloads[id];
  if (!payload) return false;
  try {
    const data = JSON.parse(payload);
    const ok = data && typeof data === "object" && data.version === 1;
    const meta = backups.find((b) => b.id === id);
    if (meta) meta.verified = ok;
    return ok;
  } catch {
    return false;
  }
}

/**
 * Restore is intentionally conservative in Phase 7:
 * validates payload structure; full merge into stores requires
 * offline SQLite persistence (later). Returns summary for UI.
 */
export function inspectBackup(id: UUID): {
  ok: boolean;
  summary?: Record<string, number>;
  error?: string;
} {
  const payload = backupPayloads[id];
  if (!payload) return { ok: false, error: "Backup not found" };
  try {
    const data = JSON.parse(payload);
    return {
      ok: true,
      summary: {
        customers: data.customers?.length ?? 0,
        products: data.products?.length ?? 0,
        sales: data.sales?.length ?? 0,
        orders: data.orders?.length ?? 0,
        expenses: data.expenses?.length ?? 0,
      },
    };
  } catch {
    return { ok: false, error: "Corrupt backup file" };
  }
}

// ---- Reports ----
export function salesReport(from?: string, to?: string): SalesReportRow[] {
  const sales = mainStore.listSales();
  const orders = ordersStore.listOrders();
  const laundry = phase5Store.listLaundryOrders();
  const expenses = phase5Store.listExpenses();

  const inRange = (iso: string) => {
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  };

  const productSales = sales.filter((s) => inRange(s.saleDate)).reduce((a, s) => a + s.total, 0);
  const serviceRevenue = orders
    .filter((o) => inRange(o.orderDate) && o.status !== "cancelled")
    .reduce((a, o) => a + o.price, 0);
  const laundryRevenue = laundry
    .filter((l) => inRange(l.createdAt) && l.status !== "cancelled")
    .reduce((a, l) => a + l.totalCustomerCharge, 0);
  const expTotal = expenses.filter((e) => inRange(e.date)).reduce((a, e) => a + e.amount, 0);

  const totalRevenue = productSales + serviceRevenue + laundryRevenue;
  return [
    {
      label: "Period",
      productSales,
      serviceRevenue,
      laundryRevenue,
      totalRevenue,
      expenses: expTotal,
      netProfit: totalRevenue - expTotal,
    },
  ];
}

export function dayEndReport(): DayEndReport {
  const today = new Date().toISOString().slice(0, 10);
  const sales = mainStore.listSales().filter((s) => s.saleDate.startsWith(today));
  const orders = ordersStore.listOrders().filter((o) => o.orderDate.startsWith(today) && o.status !== "cancelled");
  const laundry = phase5Store.listLaundryOrders().filter((l) => l.createdAt.startsWith(today));
  const expenses = phase5Store.listExpenses().filter((e) => e.date.startsWith(today));
  const payments = mainStore.listPayments().filter((p) => p.paidAt.startsWith(today));

  const productSales = sales.reduce((a, s) => a + s.total, 0);
  const cogs = sales.reduce(
    (a, s) => a + s.items.reduce((x, i) => x + i.quantity * i.costPrice, 0),
    0
  );
  const serviceRevenue = orders.reduce((a, o) => a + o.price, 0);
  const orderMat = orders.reduce((a, o) => a + o.externalMaterialCost, 0);
  const orderExp = orders.reduce((a, o) => a + o.orderExpensesTotal, 0);
  const laundryRevenue = laundry.reduce((a, l) => a + l.totalCustomerCharge, 0);
  const generalExp = expenses.filter((e) => !e.orderId).reduce((a, e) => a + e.amount, 0);

  const cash = payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
  const card = payments.filter((p) => p.method === "card" || p.method === "upi").reduce((a, p) => a + p.amount, 0);
  const other = payments.filter((p) => p.method === "bank" || p.method === "other").reduce((a, p) => a + p.amount, 0);

  const outstanding =
    sales.reduce((a, s) => a + s.balanceAmount, 0) +
    orders.reduce((a, o) => a + o.balance, 0);

  return buildDayEndReport({
    productSales,
    serviceRevenue,
    laundryRevenue,
    costOfGoods: cogs,
    orderMaterialCosts: orderMat,
    orderSpecificExpenses: orderExp,
    generalExpenses: generalExp,
    staffIncentives: 0,
    cashReceived: cash,
    cardPayments: card,
    otherPayments: other,
    outstandingAmount: outstanding,
  });
}

export function stockReport() {
  return mainStore.listProducts().map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stock: p.stockQuantity,
    min: p.minimumStock,
    value: Math.round(p.stockQuantity * p.costPrice * 100) / 100,
    low: p.stockQuantity <= p.minimumStock,
  }));
}

export function outstandingPaymentsReport() {
  const customers = mainStore.listCustomers().filter((c) => c.outstandingBalance > 0);
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding: c.outstandingBalance,
  }));
}

export function listSalesForReturn(): Sale[] {
  return mainStore.listSales().filter((s) => s.status === "completed" || s.status === "partial");
}


export function hydratePhase7(data: {
  returns?: SaleReturn[];
  auditLogs?: AuditLogEntry[];
}) {
  if (data.returns) {
    returns.length = 0;
    returns.push(...data.returns);
  }
  if (data.auditLogs) {
    auditLogs.length = 0;
    auditLogs.push(...data.auditLogs);
  }
}

