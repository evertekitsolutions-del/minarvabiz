/**
 * Data source bootstrap — Supabase when configured, else in-memory domain stores.
 */

import {
  createDatabase,
  isSupabaseConfigured,
  verifySupabaseConnection,
  authSignIn,
  authRequestPasswordReset,
  authUpdatePassword,
  configFromEnv,
  pgInsert,
  pgSelect,
  pgUpdate,
  pgRpc,
  type UnitOfWork,
} from "@minarvabiz/database";
import { store, ordersStore, phase5Store, phase6Store, warehouseStore, procurementStore, accountingStore, registerRemoteWriter, getRuntimeMode } from "@minarvabiz/business-logic";
import type { AccountingAccount, Category, Expense, GoodsReceipt, GoodsReceiptLine, JournalEntry, JournalEntryLine, LaundryOrder, Payment, Purchase, PurchaseInvoice, PurchaseInvoiceLine, PurchaseOrder, PurchaseOrderLine, StaffMember, Supplier, Warehouse, WarehouseLocation, WarehouseStockPosition, WarehouseTransfer } from "@minarvabiz/types";

let uowPromise: Promise<UnitOfWork> | null = null;
let uowAccessToken: string | null = null;
let mode: "supabase" | "memory" = "memory";
export function getDataMode(): "supabase" | "memory" { return mode; }


async function optimisticVersionUpdate(
  cfg: NonNullable<ReturnType<typeof configFromEnv>>,
  table: string,
  id: string,
  newVersion: number,
  patch: Record<string, unknown>,
  label: string
): Promise<void> {
  if (!Number.isInteger(newVersion) || newVersion < 2) {
    throw new Error(`${label} update requires an incremented version`);
  }
  const expectedVersion = newVersion - 1;
  const result = await pgUpdate<Record<string, unknown>>(
    cfg,
    table,
    `id=eq.${id}&version=eq.${expectedVersion}`,
    { ...patch, version: newVersion }
  );
  if (result.error) throw new Error(result.error.message);
  if (result.data?.length) return;

  const current = await pgSelect<Record<string, unknown>>(cfg, table, `select=id,version&id=eq.${id}&limit=1`);
  if (current.error) throw new Error(current.error.message);
  const remoteVersion = Number(current.data?.[0]?.version || 0);
  if (remoteVersion === newVersion) return; // idempotent retry of an already committed update
  throw new Error(`${label} version conflict (expected ${expectedVersion}, remote ${remoteVersion || "missing"})`);
}

async function optimisticVersionUpsert(
  cfg: NonNullable<ReturnType<typeof configFromEnv>>,
  table: string,
  id: string,
  newVersion: number,
  row: Record<string, unknown>,
  label: string
): Promise<void> {
  if (!Number.isInteger(newVersion) || newVersion < 1) {
    throw new Error(`${label} requires a positive version`);
  }
  const current = await pgSelect<Record<string, unknown>>(cfg, table, `select=id,version&id=eq.${id}&limit=1`);
  if (current.error) throw new Error(current.error.message);
  const existing = current.data?.[0];
  if (!existing) {
    const inserted = await pgInsert<Record<string, unknown>>(cfg, table, { id, ...row, version: newVersion });
    if (inserted.error) throw new Error(inserted.error.message);
    return;
  }
  const remoteVersion = Number(existing.version || 0);
  if (remoteVersion === newVersion) return; // idempotent retry
  if (newVersion < 2 || remoteVersion !== newVersion - 1) {
    throw new Error(`${label} version conflict (expected ${newVersion - 1}, remote ${remoteVersion})`);
  }
  await optimisticVersionUpdate(cfg, table, id, newVersion, row, label);
}

export async function getUnitOfWork(accessToken: string | null = null): Promise<UnitOfWork> {
  if (isSupabaseConfigured()) {
    if (!uowPromise || uowAccessToken !== accessToken) {
      mode = "supabase";
      uowAccessToken = accessToken;
      uowPromise = createDatabase({ edition: "online", accessToken });
    }
  } else if (!uowPromise && (getRuntimeMode() === "demo" || getRuntimeMode() === "development")) {
    mode = "memory";
    uowAccessToken = null;
    uowPromise = createDatabase({ edition: "memory" });
  } else if (!uowPromise) {
    throw new Error("Online production requires Supabase configuration; use the Windows desktop app for offline mode.");
  }
  return uowPromise!;
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    description: (row.description as string) ?? null,
    parentId: (row.parent_id as string) ?? null,
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
  };
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return { id: String(row.id), name: String(row.name || ""), company: (row.company as string) ?? null, phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null, address: (row.address as string) ?? null, category: (row.category as string) ?? null,
    openingBalance: Number(row.opening_balance || 0), outstandingBalance: Number(row.outstanding_balance || 0), notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null };
}

function mapLaundry(row: Record<string, unknown>): LaundryOrder {
  const customerCharge = Number(row.total_customer_charge || 0);
  const supplierCost = Number(row.total_supplier_cost || 0);
  return { id: String(row.id), orderNumber: String(row.order_number || row.id), customerId: String(row.customer_id), customerName: (row.customer_name as string) ?? null,
    garment: (row.garment as string) ?? null, quantity: Number(row.quantity || 1), mode: row.mode === "in_house_ironing" ? "in_house_ironing" : "outsourced",
    supplierId: (row.supplier_id as string) ?? null, supplierName: (row.supplier_name as string) ?? null, supplierRate: Number(row.supplier_rate || 0),
    customerRate: Number(row.customer_rate || 0), profit: customerCharge - supplierCost, totalCustomerCharge: customerCharge, totalSupplierCost: supplierCost,
    status: (row.status as LaundryOrder["status"]) || "pending", notes: (row.notes as string) ?? null,
    paidAmount: Number(row.paid_amount || 0), balanceAmount: Number(row.balance_amount || Math.max(0, customerCharge - Number(row.paid_amount || 0))),
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

function mapExpense(row: Record<string, unknown>): Expense {
  return { id: String(row.id), date: String(row.date || new Date().toISOString()), categoryId: String(row.category_id), categoryName: null,
    amount: Number(row.amount || 0), paymentMethod: (row.payment_method as Expense["paymentMethod"]) || "other", description: (row.description as string) ?? null,
    reference: (row.notes as string) ?? null, orderId: (row.order_id as string) ?? null, orderNumber: null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

function mapPurchase(row: Record<string, unknown>): Purchase {
  return { id: String(row.id), purchaseNumber: String(row.doc_number || row.id), date: String(row.date || new Date().toISOString()),
    supplierId: (row.supplier_id as string) ?? null, supplierName: null, description: String(row.notes || "Purchase"), amount: Number(row.total || 0),
    paymentMethod: (row.payment_method as Purchase["paymentMethod"]) || "other", paidAmount: Number(row.paid || 0), balanceAmount: Number(row.balance || 0),
    kind: row.kind === "order_specific" ? "order_specific" : "general", orderId: (row.order_id as string) ?? null, orderNumber: null, notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}

function mapStaff(row: Record<string, unknown>): StaffMember {
  return { id: String(row.id), name: String(row.name || ""), phone: (row.phone as string) ?? null, email: null,
    role: (row.role as StaffMember["role"]) || "staff", salary: Number(row.salary || 0), joiningDate: (row.joining_date as string) ?? null,
    status: (row.status as StaffMember["status"]) || "active", notes: null, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null, branchId: (row.branch_id as string) ?? null };
}

function mapPayment(row: Record<string, unknown>): Payment {
  return { id: String(row.id), amount: Number(row.amount || 0), method: (row.method as Payment["method"]) || "other",
    referenceType: (row.reference_type as Payment["referenceType"]) || "other", referenceId: String(row.reference_id), customerId: (row.customer_id as string) ?? null,
    notes: (row.notes as string) ?? null, paidAt: String(row.paid_at || new Date().toISOString()), createdAt: String(row.created_at || new Date().toISOString()),
    createdBy: (row.created_by as string) ?? null, branchId: (row.branch_id as string) ?? null, deviceId: (row.device_id as string) ?? null, version: Number(row.version || 1) };
}


function mapWarehouse(row: Record<string, unknown>): Warehouse {
  return {
    id: String(row.id), name: String(row.name || ""), code: String(row.code || ""),
    branchId: (row.branch_id as string) ?? null, isDefault: row.is_default === true,
    isActive: row.is_active !== false, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

function mapWarehouseLocation(row: Record<string, unknown>): WarehouseLocation {
  return {
    id: String(row.id), warehouseId: String(row.warehouse_id), code: String(row.code || ""),
    name: String(row.name || ""), type: (row.type as WarehouseLocation["type"]) || "storage",
    isActive: row.is_active !== false, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

function mapWarehouseStock(row: Record<string, unknown>): WarehouseStockPosition {
  return {
    id: String(row.id), warehouseId: String(row.warehouse_id), locationId: String(row.location_id),
    productId: String(row.product_id), onHand: Number(row.on_hand || 0), reserved: Number(row.reserved || 0),
    updatedAt: String(row.updated_at || new Date().toISOString()), version: Number(row.version || 1),
  };
}

function mapWarehouseTransfer(row: Record<string, unknown>): WarehouseTransfer {
  return {
    id: String(row.id), transferNumber: String(row.transfer_number || row.id), productId: String(row.product_id),
    sourceWarehouseId: String(row.source_warehouse_id), sourceLocationId: String(row.source_location_id),
    destinationWarehouseId: String(row.destination_warehouse_id), destinationLocationId: String(row.destination_location_id),
    quantity: Number(row.quantity || 0), status: (row.status as WarehouseTransfer["status"]) || "draft",
    notes: (row.notes as string) ?? null, createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()), approvedAt: (row.approved_at as string) ?? null,
    dispatchedAt: (row.dispatched_at as string) ?? null, receivedAt: (row.received_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null, createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}

function mapPurchaseOrderLine(row: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: String(row.id),
    purchaseOrderId: String(row.purchase_order_id),
    productId: (row.product_id as string) ?? null,
    description: String(row.description || ""),
    orderedQuantity: Number(row.ordered_quantity || 0),
    receivedQuantity: Number(row.received_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    taxRate: Number(row.tax_rate || 0),
    lineSubtotal: Number(row.line_subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

function mapPurchaseOrder(row: Record<string, unknown>, lines: PurchaseOrderLine[]): PurchaseOrder {
  return {
    id: String(row.id),
    poNumber: String(row.po_number || row.id),
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    status: (row.status as PurchaseOrder["status"]) || "draft",
    orderDate: String(row.order_date || new Date().toISOString().slice(0, 10)),
    expectedDeliveryDate: (row.expected_delivery_date as string) ?? null,
    lines,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    notes: (row.notes as string) ?? null,
    approvedAt: (row.approved_at as string) ?? null,
    approvedBy: (row.approved_by as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


function mapGoodsReceiptLine(row: Record<string, unknown>): GoodsReceiptLine {
  return {
    id: String(row.id),
    goodsReceiptId: String(row.goods_receipt_id),
    purchaseOrderLineId: String(row.purchase_order_line_id),
    productId: (row.product_id as string) ?? null,
    warehouseLocationId: (row.warehouse_location_id as string) ?? null,
    description: String(row.description || ""),
    receivedQuantity: Number(row.received_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

function mapGoodsReceipt(row: Record<string, unknown>, lines: GoodsReceiptLine[]): GoodsReceipt {
  return {
    id: String(row.id),
    grnNumber: String(row.grn_number || row.id),
    purchaseOrderId: String(row.purchase_order_id),
    poNumber: String(row.po_number || ""),
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    receiptDate: String(row.receipt_date || new Date().toISOString().slice(0, 10)),
    lines,
    subtotal: Number(row.subtotal || 0),
    notes: (row.notes as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


function mapPurchaseInvoiceLine(row: Record<string, unknown>): PurchaseInvoiceLine {
  return {
    id: String(row.id),
    purchaseInvoiceId: String(row.purchase_invoice_id),
    purchaseOrderLineId: (row.purchase_order_line_id as string) ?? null,
    productId: (row.product_id as string) ?? null,
    description: String(row.description || ""),
    invoicedQuantity: Number(row.invoiced_quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    taxRate: Number(row.tax_rate || 0),
    lineSubtotal: Number(row.line_subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

function mapPurchaseInvoice(row: Record<string, unknown>, lines: PurchaseInvoiceLine[]): PurchaseInvoice {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number || row.id),
    supplierInvoiceNumber: (row.supplier_invoice_number as string) ?? null,
    purchaseOrderId: (row.purchase_order_id as string) ?? null,
    poNumber: (row.po_number as string) ?? null,
    supplierId: String(row.supplier_id),
    supplierName: (row.supplier_name as string) ?? null,
    status: (row.status as PurchaseInvoice["status"]) || "draft",
    invoiceDate: String(row.invoice_date || new Date().toISOString().slice(0, 10)),
    dueDate: (row.due_date as string) ?? null,
    lines,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    paidAmount: Number(row.paid_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    notes: (row.notes as string) ?? null,
    postedAt: (row.posted_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    version: Number(row.version || 1),
  };
}


function mapAccountingAccount(row: Record<string, unknown>): AccountingAccount {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    type: (row.type as AccountingAccount["type"]) || "expense",
    normalBalance: (row.normal_balance as AccountingAccount["normalBalance"]) || "debit",
    parentId: (row.parent_id as string) ?? null,
    systemKey: (row.system_key as string) ?? null,
    isActive: row.is_active !== false,
    branchId: (row.branch_id as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    version: Number(row.version || 1),
  };
}

function mapJournalEntryLine(row: Record<string, unknown>): JournalEntryLine {
  return {
    id: String(row.id),
    journalEntryId: String(row.journal_entry_id),
    accountId: String(row.account_id),
    accountCode: String(row.account_code || ""),
    accountName: String(row.account_name || ""),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    memo: (row.memo as string) ?? null,
  };
}

function mapJournalEntry(row: Record<string, unknown>, lines: JournalEntryLine[]): JournalEntry {
  return {
    id: String(row.id),
    journalNumber: String(row.journal_number || row.id),
    entryDate: String(row.entry_date || new Date().toISOString().slice(0, 10)),
    description: String(row.description || ""),
    referenceType: (row.reference_type as string) ?? null,
    referenceId: (row.reference_id as string) ?? null,
    status: (row.status as JournalEntry["status"]) || "draft",
    lines,
    totalDebit: Number(row.total_debit || 0),
    totalCredit: Number(row.total_credit || 0),
    postedAt: (row.posted_at as string) ?? null,
    voidedAt: (row.voided_at as string) ?? null,
    reversalJournalId: (row.reversal_journal_id as string) ?? null,
    branchId: (row.branch_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    version: Number(row.version || 1),
  };
}

export async function hydrateStoresFromSupabase(accessToken: string | null = null): Promise<{ ok: boolean; message: string; counts?: Record<string, number> }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase is not configured for online production." };
  const cfg = configFromEnv();
  if (!cfg) return { ok: false, message: "Supabase configuration is unavailable." };
  cfg.accessToken = accessToken;
  const check = await verifySupabaseConnection(cfg);
  if (!check.ok) return { ok: false, message: check.message };
  const db = await getUnitOfWork(accessToken);
  try {
    const [customers, products, sales, orders] = await Promise.all([db.customers.list(), db.products.list(), db.sales.list(), db.orders.list()]);
    const [categoriesRes, expensesRes, purchasesRes, suppliersRes, laundryRes, staffRes, paymentsRes, warehousesRes, warehouseLocationsRes, warehouseStockRes, warehouseTransfersRes, purchaseOrdersRes, purchaseOrderLinesRes, goodsReceiptsRes, goodsReceiptLinesRes, purchaseInvoicesRes, purchaseInvoiceLinesRes, accountsRes, journalEntriesRes, journalLinesRes] = await Promise.all([
      pgSelect<Record<string, unknown>>(cfg, "categories", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "expenses", "select=*&deleted_at=is.null&order=date.desc"),
      pgSelect<Record<string, unknown>>(cfg, "purchases", "select=*&deleted_at=is.null&order=date.desc"),
      pgSelect<Record<string, unknown>>(cfg, "suppliers", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "laundry_orders", "select=*&deleted_at=is.null&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "staff_members", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "payments", "select=*&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "warehouses", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "warehouse_locations", "select=*&deleted_at=is.null&order=code.asc"),
      pgSelect<Record<string, unknown>>(cfg, "warehouse_stock", "select=*&order=updated_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "warehouse_transfers", "select=*&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "purchase_orders", "select=*&deleted_at=is.null&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "purchase_order_lines", "select=*&order=created_at.asc"),
      pgSelect<Record<string, unknown>>(cfg, "goods_receipts", "select=*&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "goods_receipt_lines", "select=*&order=created_at.asc"),
      pgSelect<Record<string, unknown>>(cfg, "purchase_invoices", "select=*&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "purchase_invoice_lines", "select=*&order=created_at.asc"),
      pgSelect<Record<string, unknown>>(cfg, "accounts", "select=*&deleted_at=is.null&order=code.asc"),
      pgSelect<Record<string, unknown>>(cfg, "journal_entries", "select=*&order=entry_date.desc,created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "journal_entry_lines", "select=*&order=created_at.asc"),
    ]);
    for (const result of [categoriesRes, expensesRes, purchasesRes, suppliersRes, laundryRes, staffRes, paymentsRes, warehousesRes, warehouseLocationsRes, warehouseStockRes, warehouseTransfersRes, purchaseOrdersRes, purchaseOrderLinesRes, goodsReceiptsRes, goodsReceiptLinesRes, purchaseInvoicesRes, purchaseInvoiceLinesRes, accountsRes, journalEntriesRes, journalLinesRes]) if (result.error) throw new Error(result.error.message);
    store.hydrateCore({ customers, products, categories: (categoriesRes.data || []).map(mapCategory), sales, payments: (paymentsRes.data || []).map(mapPayment) });
    ordersStore.hydrateOrders({ orders });
    phase5Store.hydratePhase5({ expenses: (expensesRes.data || []).map(mapExpense), purchases: (purchasesRes.data || []).map(mapPurchase), suppliers: (suppliersRes.data || []).map(mapSupplier), laundryOrders: (laundryRes.data || []).map(mapLaundry) });
    phase6Store.hydratePhase6({ staff: (staffRes.data || []).map(mapStaff) });
    warehouseStore.hydrateWarehouseState({
      warehouses: (warehousesRes.data || []).map(mapWarehouse),
      locations: (warehouseLocationsRes.data || []).map(mapWarehouseLocation),
      stock: (warehouseStockRes.data || []).map(mapWarehouseStock),
      transfers: (warehouseTransfersRes.data || []).map(mapWarehouseTransfer),
    });
    const poLines = (purchaseOrderLinesRes.data || []).map(mapPurchaseOrderLine);
    const grnLines = (goodsReceiptLinesRes.data || []).map(mapGoodsReceiptLine);
    const invoiceLines = (purchaseInvoiceLinesRes.data || []).map(mapPurchaseInvoiceLine);
    procurementStore.hydrateProcurementState({
      purchaseOrders: (purchaseOrdersRes.data || []).map((row) =>
        mapPurchaseOrder(row, poLines.filter((line) => line.purchaseOrderId === String(row.id)))
      ),
      goodsReceipts: (goodsReceiptsRes.data || []).map((row) =>
        mapGoodsReceipt(row, grnLines.filter((line) => line.goodsReceiptId === String(row.id)))
      ),
      purchaseInvoices: (purchaseInvoicesRes.data || []).map((row) =>
        mapPurchaseInvoice(row, invoiceLines.filter((line) => line.purchaseInvoiceId === String(row.id)))
      ),
    });
    const journalLines = (journalLinesRes.data || []).map(mapJournalEntryLine);
    accountingStore.hydrateAccountingState({
      accounts: (accountsRes.data || []).map(mapAccountingAccount),
      journals: (journalEntriesRes.data || []).map((row) =>
        mapJournalEntry(row, journalLines.filter((line) => line.journalEntryId === String(row.id)))
      ),
    });

    registerRemoteWriter({
      upsertCustomer: async (customer) => {
        const row = {
          name: customer.name,
          phone: customer.phone ?? null,
          whatsapp: customer.whatsapp ?? null,
          email: customer.email ?? null,
          address: customer.address ?? null,
          birthday: customer.birthday ?? null,
          notes: customer.notes ?? null,
          outstanding_balance: customer.outstandingBalance ?? 0,
          total_spending: customer.totalSpending ?? 0,
          created_at: customer.createdAt,
          updated_at: customer.updatedAt,
          deleted_at: customer.deletedAt ?? null,
          branch_id: customer.branchId ?? null,
        };
        await optimisticVersionUpsert(cfg, "customers", customer.id, customer.version || 1, row, "Customer");
      },
      upsertCategory: async (category) => {
        const found = await pgSelect<Record<string, unknown>>(cfg, "categories", `select=id&id=eq.${category.id}&limit=1`);
        if (found.error) throw new Error(found.error.message);
        const row = {
          name: category.name, description: category.description ?? null, parent_id: category.parentId ?? null,
          is_active: category.isActive, updated_at: category.updatedAt, branch_id: category.branchId ?? null,
        };
        const res = found.data?.[0]
          ? await pgUpdate<Record<string, unknown>>(cfg, "categories", `id=eq.${category.id}`, row)
          : await pgInsert<Record<string, unknown>>(cfg, "categories", { id: category.id, ...row, created_at: category.createdAt });
        if (res.error) throw new Error(res.error.message);
      },
      upsertProduct: async (product) => {
        const row = {
          name: product.name, sku: product.sku ?? null, barcode: product.barcode ?? null,
          category_id: product.categoryId ?? null, brand: product.brand ?? null, size: product.size ?? null,
          color: product.color ?? null, fabric: product.fabric ?? null, parent_product_id: product.parentProductId ?? null,
          has_variants: product.hasVariants ?? false, unit: product.unit ?? "pcs", cost_price: product.costPrice ?? 0,
          selling_price: product.sellingPrice ?? 0, discount: product.discount ?? null, tax_rate: product.taxRate ?? null,
          stock_quantity: product.stockQuantity ?? 0, minimum_stock: product.minimumStock ?? 0,
          supplier_id: product.supplierId ?? null, image_url: product.imageUrl ?? null, notes: product.notes ?? null,
          is_active: product.isActive !== false, created_at: product.createdAt, updated_at: product.updatedAt,
          deleted_at: product.deletedAt ?? null, branch_id: product.branchId ?? null,
        };
        await optimisticVersionUpsert(cfg, "products", product.id, product.version || 1, row, "Product");
      },
      createSale: async (sale, salePayments, allowNegativeStock) => {
        const result = await pgRpc<Record<string, unknown>>(cfg, "create_sale", {
          p_sale: {
            id: sale.id,
            invoice_number: sale.invoiceNumber,
            customer_id: sale.customerId ?? null,
            customer_name: sale.customerName ?? null,
            sale_date: sale.saleDate,
            subtotal: sale.subtotal,
            discount_amount: sale.discountAmount,
            tax_amount: sale.taxAmount,
            total: sale.total,
            paid_amount: sale.paidAmount,
            balance_amount: sale.balanceAmount,
            status: sale.status,
            notes: sale.notes ?? null,
            created_at: sale.createdAt,
            updated_at: sale.updatedAt,
            branch_id: sale.branchId ?? null,
            device_id: sale.deviceId ?? null,
            created_by: sale.createdBy ?? null,
            version: sale.version,
            items: sale.items.map((item) => ({
              id: item.id,
              product_id: item.productId,
              product_name: item.productName,
              sku: item.sku ?? null,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              cost_price: item.costPrice,
              discount_percent: item.discountPercent,
              tax_rate: item.taxRate,
              line_total: item.lineTotal,
            })),
          },
          p_payments: salePayments.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            method: payment.method,
            reference_type: payment.referenceType,
            reference_id: payment.referenceId,
            customer_id: payment.customerId ?? null,
            notes: payment.notes ?? null,
            paid_at: payment.paidAt,
            created_at: payment.createdAt,
            created_by: payment.createdBy ?? null,
            branch_id: payment.branchId ?? null,
            device_id: payment.deviceId ?? null,
            version: payment.version,
          })),
          p_allow_negative_stock: allowNegativeStock,
        });
        if (result.error) throw new Error(result.error.message);
      },
      recordCustomerPayment: async (payment, settledSales) => {
        const result = await pgRpc<Record<string, unknown>>(cfg, "record_payment", {
          p_payment: {
            id: payment.id,
            amount: payment.amount,
            method: payment.method,
            reference_type: payment.referenceType,
            reference_id: payment.referenceId,
            customer_id: payment.customerId ?? null,
            notes: payment.notes ?? null,
            paid_at: payment.paidAt,
            created_at: payment.createdAt,
            created_by: payment.createdBy ?? null,
            branch_id: payment.branchId ?? null,
            device_id: payment.deviceId ?? null,
            version: payment.version,
          },
          p_sale_settlements: settledSales.map((sale) => ({
            id: sale.id,
            paid_amount: sale.paidAmount,
            balance_amount: sale.balanceAmount,
            status: sale.status,
            updated_at: sale.updatedAt,
            version: sale.version,
          })),
        });
        if (result.error) throw new Error(result.error.message);
      },
      adjustStock: async (product, movementType, quantity, notes) => {
        const newVersion = product.version || 1;
        const result = await pgRpc<Record<string, unknown>>(cfg, "adjust_stock", {
          p_product_id: product.id,
          p_movement_type: movementType,
          p_quantity: quantity,
          p_expected_version: newVersion - 1,
          p_reference_type: "inventory_adjustment",
          p_reference_id: null,
          p_notes: notes ?? null,
          p_branch_id: product.branchId ?? null,
          p_device_id: null,
        });
        if (result.error) throw new Error(result.error.message);
      },
      updateSaleSettlement: async (sale) => {
        await optimisticVersionUpdate(cfg, "sales", sale.id, sale.version, {
          paid_amount: sale.paidAmount,
          balance_amount: sale.balanceAmount,
          status: sale.status,
          updated_at: sale.updatedAt,
        }, "Sale settlement");
      },
      createOrder: async (order) => { await db.orders.create(order); },
      updateOrder: async (id, patch) => { await db.orders.update(id, patch); },
      createPayment: async (payment) => { const res = await pgInsert<Record<string, unknown>>(cfg, "payments", { id: payment.id, amount: payment.amount, method: payment.method, reference_type: payment.referenceType, reference_id: payment.referenceId, customer_id: payment.customerId ?? null, notes: payment.notes ?? null, paid_at: payment.paidAt, created_at: payment.createdAt, created_by: payment.createdBy ?? null, branch_id: payment.branchId ?? null, device_id: payment.deviceId ?? null, version: payment.version || 1 }); if (res.error) throw new Error(res.error.message); },
      createExpense: async (expense) => { const res = await pgInsert<Record<string, unknown>>(cfg, "expenses", { id: expense.id, category_id: expense.categoryId, description: expense.description ?? "", amount: expense.amount, date: String(expense.date).slice(0, 10), payment_method: expense.paymentMethod, order_id: expense.orderId ?? null, notes: expense.reference ?? null, created_at: expense.createdAt, updated_at: expense.updatedAt, branch_id: expense.branchId ?? null, device_id: expense.deviceId ?? null, version: expense.version || 1 }); if (res.error) throw new Error(res.error.message); },
      createSupplier: async (supplier) => { const res = await pgInsert<Record<string, unknown>>(cfg, "suppliers", { id: supplier.id, name: supplier.name, company: supplier.company ?? null, phone: supplier.phone ?? null, email: supplier.email ?? null, address: supplier.address ?? null, category: supplier.category ?? null, opening_balance: supplier.openingBalance ?? 0, outstanding_balance: supplier.outstandingBalance ?? 0, notes: supplier.notes ?? null, created_at: supplier.createdAt, updated_at: supplier.updatedAt, branch_id: supplier.branchId ?? null }); if (res.error) throw new Error(res.error.message); },
      upsertSupplier: async (supplier) => {
        const row = { name: supplier.name, company: supplier.company ?? null, phone: supplier.phone ?? null, email: supplier.email ?? null, address: supplier.address ?? null, category: supplier.category ?? null, opening_balance: supplier.openingBalance ?? 0, outstanding_balance: supplier.outstandingBalance ?? 0, notes: supplier.notes ?? null, updated_at: supplier.updatedAt, branch_id: supplier.branchId ?? null };
        const updated = await pgUpdate<Record<string, unknown>>(cfg, "suppliers", `id=eq.${supplier.id}`, row);
        if (!updated.error && updated.data?.length) return;
        const inserted = await pgInsert<Record<string, unknown>>(cfg, "suppliers", { id: supplier.id, ...row, created_at: supplier.createdAt });
        if (inserted.error) throw new Error(inserted.error.message);
      },
      createLaundry: async (laundry) => { const res = await pgInsert<Record<string, unknown>>(cfg, "laundry_orders", { id: laundry.id, order_number: laundry.orderNumber, customer_id: laundry.customerId, customer_name: laundry.customerName ?? null, supplier_id: laundry.supplierId ?? null, supplier_name: laundry.supplierName ?? null, garment: laundry.garment ?? "Laundry", quantity: laundry.quantity ?? 1, mode: laundry.mode, customer_rate: laundry.customerRate ?? 0, supplier_rate: laundry.supplierRate ?? 0, total_customer_charge: laundry.totalCustomerCharge ?? 0, total_supplier_cost: laundry.totalSupplierCost ?? 0, status: laundry.status ?? "pending", notes: laundry.notes ?? null, paid_amount: laundry.paidAmount ?? 0, balance_amount: laundry.balanceAmount ?? 0, created_at: laundry.createdAt, updated_at: laundry.updatedAt, branch_id: laundry.branchId ?? null, device_id: laundry.deviceId ?? null, version: laundry.version || 1 }); if (res.error) throw new Error(res.error.message); },
      updatePurchaseSettlement: async (purchase) => {
        await optimisticVersionUpdate(cfg, "purchases", purchase.id, purchase.version, {
          paid: purchase.paidAmount,
          balance: purchase.balanceAmount,
          updated_at: purchase.updatedAt,
        }, "Purchase settlement");
      },
      createPurchase: async (purchase) => { const res = await pgInsert<Record<string, unknown>>(cfg, "purchases", { id: purchase.id, supplier_id: purchase.supplierId ?? null, doc_number: purchase.purchaseNumber, kind: purchase.kind, order_id: purchase.orderId ?? null, total: purchase.amount, paid: purchase.paidAmount, balance: purchase.balanceAmount, payment_method: purchase.paymentMethod, date: String(purchase.date).slice(0, 10), notes: purchase.notes ?? purchase.description ?? null, created_at: purchase.createdAt, updated_at: purchase.updatedAt, branch_id: purchase.branchId ?? null, device_id: purchase.deviceId ?? null, version: purchase.version || 1 }); if (res.error) throw new Error(res.error.message); },
      upsertWarehouse: async (warehouse) => {
        const row = { branch_id: warehouse.branchId ?? null, name: warehouse.name, code: warehouse.code, is_default: warehouse.isDefault, is_active: warehouse.isActive, created_at: warehouse.createdAt, updated_at: warehouse.updatedAt, deleted_at: warehouse.deletedAt ?? null };
        await optimisticVersionUpsert(cfg, "warehouses", warehouse.id, warehouse.version, row, "Warehouse");
      },
      upsertWarehouseLocation: async (location) => {
        const row = { warehouse_id: location.warehouseId, code: location.code, name: location.name, type: location.type, is_active: location.isActive, created_at: location.createdAt, updated_at: location.updatedAt, deleted_at: location.deletedAt ?? null };
        await optimisticVersionUpsert(cfg, "warehouse_locations", location.id, location.version, row, "Warehouse location");
      },
      upsertWarehouseStock: async (position) => {
        const row = { warehouse_id: position.warehouseId, location_id: position.locationId, product_id: position.productId, on_hand: position.onHand, reserved: position.reserved, updated_at: position.updatedAt };
        await optimisticVersionUpsert(cfg, "warehouse_stock", position.id, position.version, row, "Warehouse stock");
      },
      upsertWarehouseTransfer: async (transfer) => {
        const row = { transfer_number: transfer.transferNumber, product_id: transfer.productId, source_warehouse_id: transfer.sourceWarehouseId, source_location_id: transfer.sourceLocationId, destination_warehouse_id: transfer.destinationWarehouseId, destination_location_id: transfer.destinationLocationId, quantity: transfer.quantity, status: transfer.status, notes: transfer.notes ?? null, created_at: transfer.createdAt, updated_at: transfer.updatedAt, approved_at: transfer.approvedAt ?? null, dispatched_at: transfer.dispatchedAt ?? null, received_at: transfer.receivedAt ?? null, cancelled_at: transfer.cancelledAt ?? null, created_by: transfer.createdBy ?? null };
        await optimisticVersionUpsert(cfg, "warehouse_transfers", transfer.id, transfer.version, row, "Warehouse transfer");
      },
      upsertPurchaseOrder: async (purchaseOrder) => {
        const row = {
          branch_id: purchaseOrder.branchId ?? null,
          po_number: purchaseOrder.poNumber,
          supplier_id: purchaseOrder.supplierId,
          supplier_name: purchaseOrder.supplierName ?? null,
          status: purchaseOrder.status,
          order_date: String(purchaseOrder.orderDate).slice(0, 10),
          expected_delivery_date: purchaseOrder.expectedDeliveryDate ? String(purchaseOrder.expectedDeliveryDate).slice(0, 10) : null,
          subtotal: purchaseOrder.subtotal,
          tax_amount: purchaseOrder.taxAmount,
          total: purchaseOrder.total,
          notes: purchaseOrder.notes ?? null,
          approved_at: purchaseOrder.approvedAt ?? null,
          approved_by: purchaseOrder.approvedBy ?? null,
          cancelled_at: purchaseOrder.cancelledAt ?? null,
          created_at: purchaseOrder.createdAt,
          updated_at: purchaseOrder.updatedAt,
          deleted_at: purchaseOrder.deletedAt ?? null,
          created_by: purchaseOrder.createdBy ?? null,
          version: purchaseOrder.version,
        };
        const { version: _purchaseOrderVersion, ...purchaseOrderRow } = row;
        await optimisticVersionUpsert(cfg, "purchase_orders", purchaseOrder.id, purchaseOrder.version, purchaseOrderRow, "Purchase order");
        for (const line of purchaseOrder.lines) {
          const lineRow = {
            purchase_order_id: purchaseOrder.id,
            product_id: line.productId ?? null,
            description: line.description,
            ordered_quantity: line.orderedQuantity,
            received_quantity: line.receivedQuantity,
            unit_cost: line.unitCost,
            tax_rate: line.taxRate,
            line_subtotal: line.lineSubtotal,
            tax_amount: line.taxAmount,
            line_total: line.lineTotal,
            updated_at: purchaseOrder.updatedAt,
            version: purchaseOrder.version,
          };
          const { version: _lineVersion, ...purchaseOrderLineRow } = lineRow;
          await optimisticVersionUpsert(
            cfg,
            "purchase_order_lines",
            line.id,
            purchaseOrder.version,
            { ...purchaseOrderLineRow, created_at: purchaseOrder.createdAt },
            "Purchase order line"
          );
        }
      },
      upsertGoodsReceipt: async (receipt) => {
        const row = {
          branch_id: receipt.branchId ?? null,
          grn_number: receipt.grnNumber,
          purchase_order_id: receipt.purchaseOrderId,
          po_number: receipt.poNumber,
          supplier_id: receipt.supplierId,
          supplier_name: receipt.supplierName ?? null,
          receipt_date: String(receipt.receiptDate).slice(0, 10),
          subtotal: receipt.subtotal,
          notes: receipt.notes ?? null,
          created_at: receipt.createdAt,
          created_by: receipt.createdBy ?? null,
          version: receipt.version,
        };
        const { version: _receiptVersion, ...receiptRow } = row;
        await optimisticVersionUpsert(cfg, "goods_receipts", receipt.id, receipt.version, receiptRow, "Goods receipt");
        for (const line of receipt.lines) {
          const lineRow = {
            goods_receipt_id: receipt.id,
            purchase_order_line_id: line.purchaseOrderLineId,
            product_id: line.productId ?? null,
            warehouse_location_id: line.warehouseLocationId ?? null,
            description: line.description,
            received_quantity: line.receivedQuantity,
            unit_cost: line.unitCost,
            line_total: line.lineTotal,
            created_at: receipt.createdAt,
          };
          const lineUpdated = await pgUpdate<Record<string, unknown>>(cfg, "goods_receipt_lines", `id=eq.${line.id}`, lineRow);
          if (lineUpdated.error || !lineUpdated.data?.length) {
            const lineInserted = await pgInsert<Record<string, unknown>>(cfg, "goods_receipt_lines", { id: line.id, ...lineRow });
            if (lineInserted.error) throw new Error(lineInserted.error.message);
          }
        }
      },
      upsertPurchaseInvoice: async (invoice) => {
        const row = {
          branch_id: invoice.branchId ?? null,
          invoice_number: invoice.invoiceNumber,
          supplier_invoice_number: invoice.supplierInvoiceNumber ?? null,
          purchase_order_id: invoice.purchaseOrderId ?? null,
          po_number: invoice.poNumber ?? null,
          supplier_id: invoice.supplierId,
          supplier_name: invoice.supplierName ?? null,
          status: invoice.status,
          invoice_date: String(invoice.invoiceDate).slice(0, 10),
          due_date: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : null,
          subtotal: invoice.subtotal,
          tax_amount: invoice.taxAmount,
          total: invoice.total,
          paid_amount: invoice.paidAmount,
          balance_amount: invoice.balanceAmount,
          notes: invoice.notes ?? null,
          posted_at: invoice.postedAt ?? null,
          cancelled_at: invoice.cancelledAt ?? null,
          created_at: invoice.createdAt,
          updated_at: invoice.updatedAt,
          created_by: invoice.createdBy ?? null,
          version: invoice.version,
        };
        const { version: _invoiceVersion, ...invoiceRow } = row;
        await optimisticVersionUpsert(cfg, "purchase_invoices", invoice.id, invoice.version, invoiceRow, "Purchase invoice");
        for (const line of invoice.lines) {
          const lineRow = {
            purchase_invoice_id: invoice.id,
            purchase_order_line_id: line.purchaseOrderLineId ?? null,
            product_id: line.productId ?? null,
            description: line.description,
            invoiced_quantity: line.invoicedQuantity,
            unit_cost: line.unitCost,
            tax_rate: line.taxRate,
            line_subtotal: line.lineSubtotal,
            tax_amount: line.taxAmount,
            line_total: line.lineTotal,
            updated_at: invoice.updatedAt,
            version: invoice.version,
          };
          const { version: _invoiceLineVersion, ...purchaseInvoiceLineRow } = lineRow;
          await optimisticVersionUpsert(
            cfg,
            "purchase_invoice_lines",
            line.id,
            invoice.version,
            { ...purchaseInvoiceLineRow, created_at: invoice.createdAt },
            "Purchase invoice line"
          );
        }
      },
      upsertAccountingAccount: async (account) => {
        const row = {
          branch_id: account.branchId ?? null,
          code: account.code,
          name: account.name,
          type: account.type,
          normal_balance: account.normalBalance,
          parent_id: account.parentId ?? null,
          system_key: account.systemKey ?? null,
          is_active: account.isActive,
          created_at: account.createdAt,
          updated_at: account.updatedAt,
          deleted_at: account.deletedAt ?? null,
          version: account.version,
        };
        const { version: _accountVersion, ...accountRow } = row;
        await optimisticVersionUpsert(cfg, "accounts", account.id, account.version, accountRow, "Accounting account");
      },
      upsertJournalEntry: async (entry) => {
        const row = {
          branch_id: entry.branchId ?? null,
          journal_number: entry.journalNumber,
          entry_date: String(entry.entryDate).slice(0, 10),
          description: entry.description,
          reference_type: entry.referenceType ?? null,
          reference_id: entry.referenceId ?? null,
          status: entry.status,
          total_debit: entry.totalDebit,
          total_credit: entry.totalCredit,
          posted_at: entry.postedAt ?? null,
          voided_at: entry.voidedAt ?? null,
          reversal_journal_id: entry.reversalJournalId ?? null,
          created_by: entry.createdBy ?? null,
          created_at: entry.createdAt,
          updated_at: entry.updatedAt,
          version: entry.version,
        };
        const { version: _entryVersion, ...journalRow } = row;
        await optimisticVersionUpsert(cfg, "journal_entries", entry.id, entry.version, journalRow, "Journal entry");
        for (const line of entry.lines) {
          const lineRow = {
            journal_entry_id: entry.id,
            account_id: line.accountId,
            account_code: line.accountCode,
            account_name: line.accountName,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo ?? null,
            updated_at: entry.updatedAt,
          };
          const lineUpdated = await pgUpdate<Record<string, unknown>>(cfg, "journal_entry_lines", `id=eq.${line.id}`, lineRow);
          if (lineUpdated.error || !lineUpdated.data?.length) {
            const lineInserted = await pgInsert<Record<string, unknown>>(cfg, "journal_entry_lines", { id: line.id, ...lineRow, created_at: entry.createdAt });
            if (lineInserted.error) throw new Error(lineInserted.error.message);
          }
        }
      },
    });

    // Ensure the standard tenant chart exists before journal lines can reference it.
    // IDs are generated per tenant, so there is no cross-organization primary-key collision.
    for (const account of accountingStore.listAccounts()) {
      const row = {
        branch_id: account.branchId ?? null,
        code: account.code,
        name: account.name,
        type: account.type,
        normal_balance: account.normalBalance,
        parent_id: account.parentId ?? null,
        system_key: account.systemKey ?? null,
        is_active: account.isActive,
        created_at: account.createdAt,
        updated_at: account.updatedAt,
        deleted_at: account.deletedAt ?? null,
        version: account.version,
      };
      const { version: _bootstrapAccountVersion, ...bootstrapAccountRow } = row;
      await optimisticVersionUpsert(cfg, "accounts", account.id, account.version, bootstrapAccountRow, "Accounting account bootstrap");
    }
    return { ok: true, message: "Hydrated from Supabase", counts: { customers: customers.length, products: products.length, categories: categoriesRes.data?.length || 0, sales: sales.length, orders: orders.length, expenses: expensesRes.data?.length || 0, purchases: purchasesRes.data?.length || 0, suppliers: suppliersRes.data?.length || 0, laundry: laundryRes.data?.length || 0, staff: staffRes.data?.length || 0, payments: paymentsRes.data?.length || 0, warehouses: warehousesRes.data?.length || 0, warehouseLocations: warehouseLocationsRes.data?.length || 0, warehouseStock: warehouseStockRes.data?.length || 0, warehouseTransfers: warehouseTransfersRes.data?.length || 0, purchaseOrders: purchaseOrdersRes.data?.length || 0, goodsReceipts: goodsReceiptsRes.data?.length || 0, purchaseInvoices: purchaseInvoicesRes.data?.length || 0, accounts: accountingStore.listAccounts().length, journals: journalEntriesRes.data?.length || 0 } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

export async function supabaseLogin(email: string, password: string) {
  const cfg = configFromEnv(); if (!cfg) return { ok: false as const, error: "Supabase not configured" };
  const res = await authSignIn(cfg, email, password); if (res.error || !res.data) return { ok: false as const, error: res.error?.message || "Login failed" };
  return { ok: true as const, token: res.data.access_token, user: res.data.user };
}


export async function requestPasswordReset(email: string, redirectTo: string) {
  const cfg = configFromEnv();
  if (!cfg) return { ok: false as const, error: "Password recovery requires the online Supabase edition." };
  const res = await authRequestPasswordReset(cfg, email.trim().toLowerCase(), redirectTo);
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const };
}

export async function updatePasswordFromRecovery(accessToken: string, password: string) {
  const cfg = configFromEnv();
  if (!cfg) return { ok: false as const, error: "Password reset requires the online Supabase edition." };
  if (!accessToken) return { ok: false as const, error: "The recovery link is missing or has expired." };
  const res = await authUpdatePassword(cfg, accessToken, password);
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const };
}
