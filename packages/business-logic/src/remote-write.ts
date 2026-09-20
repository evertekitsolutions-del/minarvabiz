/**
 * Optional dual-write to Supabase UnitOfWork after local domain mutations.
 * Set via registerRemoteWriter from the web app when online.
 */

import type {
  Customer,
  Category,
  Product,
  Sale,
  ServiceOrder,
  Payment,
  Expense,
  Supplier,
  LaundryOrder,
  Purchase,
  Warehouse,
  WarehouseLocation,
  WarehouseStockPosition,
  WarehouseTransfer,
  PurchaseOrder,
  GoodsReceipt,
  PurchaseInvoice,
  AccountingAccount,
  JournalEntry,
} from "@minarvabiz/types";
import { enqueueOutbox } from "./outbox-bridge";

export interface RemoteWriter {
  upsertCustomer?: (c: Customer) => Promise<void>;
  upsertCategory?: (c: Category) => Promise<void>;
  upsertProduct?: (p: Product) => Promise<void>;
  createSale?: (s: Sale) => Promise<void>;
  updateSaleSettlement?: (sale: Sale) => Promise<void>;
  createOrder?: (o: ServiceOrder) => Promise<void>;
  updateOrder?: (id: string, patch: Partial<ServiceOrder>) => Promise<void>;
  createPayment?: (p: Payment) => Promise<void>;
  createExpense?: (e: Expense) => Promise<void>;
  createSupplier?: (s: Supplier) => Promise<void>;
  upsertSupplier?: (s: Supplier) => Promise<void>;
  createLaundry?: (o: LaundryOrder) => Promise<void>;
  createPurchase?: (p: Purchase) => Promise<void>;
  upsertWarehouse?: (w: Warehouse) => Promise<void>;
  upsertWarehouseLocation?: (l: WarehouseLocation) => Promise<void>;
  upsertWarehouseStock?: (s: WarehouseStockPosition) => Promise<void>;
  upsertWarehouseTransfer?: (t: WarehouseTransfer) => Promise<void>;
  upsertPurchaseOrder?: (po: PurchaseOrder) => Promise<void>;
  upsertGoodsReceipt?: (receipt: GoodsReceipt) => Promise<void>;
  upsertPurchaseInvoice?: (invoice: PurchaseInvoice) => Promise<void>;
  upsertAccountingAccount?: (account: AccountingAccount) => Promise<void>;
  upsertJournalEntry?: (entry: JournalEntry) => Promise<void>;
}

let writer: RemoteWriter | null = null;

export function registerRemoteWriter(w: RemoteWriter | null) {
  writer = w;
}

export function getRemoteWriter(): RemoteWriter | null {
  return writer;
}

export async function remoteUpsertCustomer(c: Customer) {
  enqueueOutbox("customers", c.id, "insert", c);
  try { await writer?.upsertCustomer?.(c); }
  catch (e) { console.warn("[minarvabiz] remote customer write failed", e); }
}

export async function remoteUpsertCategory(c: Category) {
  enqueueOutbox("categories", c.id, "insert", c);
  try { await writer?.upsertCategory?.(c); }
  catch (e) { console.warn("[minarvabiz] remote category write failed", e); }
}

export async function remoteUpsertProduct(p: Product) {
  enqueueOutbox("products", p.id, "insert", p);
  try { await writer?.upsertProduct?.(p); }
  catch (e) { console.warn("[minarvabiz] remote product write failed", e); }
}

export async function remoteCreateSale(s: Sale) {
  enqueueOutbox("sales", s.id, "insert", s);
  try { await writer?.createSale?.(s); }
  catch (e) { console.warn("[minarvabiz] remote sale write failed", e); }
}

export async function remoteCreateOrder(o: ServiceOrder) {
  enqueueOutbox("orders", o.id, "insert", o);
  try { await writer?.createOrder?.(o); }
  catch (e) { console.warn("[minarvabiz] remote order write failed", e); }
}

export async function remoteCreatePayment(p: Payment) {
  enqueueOutbox("payments", p.id, "insert", p);
  try { await writer?.createPayment?.(p); }
  catch (e) { console.warn("[minarvabiz] remote payment write failed", e); }
}

export async function remoteCreateExpense(e: Expense) {
  enqueueOutbox("expenses", e.id, "insert", e);
  try { await writer?.createExpense?.(e); }
  catch (err) { console.warn("[minarvabiz] remote expense write failed", err); }
}

export async function remoteCreateSupplier(s: Supplier) {
  enqueueOutbox("suppliers", s.id, "insert", s);
  try {
    if (writer?.upsertSupplier) await writer.upsertSupplier(s);
    else await writer?.createSupplier?.(s);
  }
  catch (e) { console.warn("[minarvabiz] remote supplier write failed", e); }
}

export async function remoteUpsertSupplier(s: Supplier) {
  enqueueOutbox("suppliers", s.id, "update", s);
  try {
    if (writer?.upsertSupplier) await writer.upsertSupplier(s);
    else await writer?.createSupplier?.(s);
  }
  catch (e) { console.warn("[minarvabiz] remote supplier update failed", e); }
}

export async function remoteCreateLaundry(o: LaundryOrder) {
  enqueueOutbox("laundry_orders", o.id, "insert", o);
  try { await writer?.createLaundry?.(o); }
  catch (e) { console.warn("[minarvabiz] remote laundry write failed", e); }
}

export async function remoteCreatePurchase(p: Purchase) {
  enqueueOutbox("purchases", p.id, "insert", p);
  try { await writer?.createPurchase?.(p); }
  catch (e) { console.warn("[minarvabiz] remote purchase write failed", e); }
}


export async function remoteUpsertWarehouse(w: Warehouse) {
  enqueueOutbox("warehouses", w.id, "update", w);
  try { await writer?.upsertWarehouse?.(w); }
  catch (e) { console.warn("[minarvabiz] remote warehouse write failed", e); }
}

export async function remoteUpsertWarehouseLocation(l: WarehouseLocation) {
  enqueueOutbox("warehouse_locations", l.id, "update", l);
  try { await writer?.upsertWarehouseLocation?.(l); }
  catch (e) { console.warn("[minarvabiz] remote warehouse location write failed", e); }
}

export async function remoteUpsertWarehouseStock(s: WarehouseStockPosition) {
  enqueueOutbox("warehouse_stock", s.id, "update", s);
  try { await writer?.upsertWarehouseStock?.(s); }
  catch (e) { console.warn("[minarvabiz] remote warehouse stock write failed", e); }
}

export async function remoteUpsertWarehouseTransfer(t: WarehouseTransfer) {
  enqueueOutbox("warehouse_transfers", t.id, "update", t);
  try { await writer?.upsertWarehouseTransfer?.(t); }
  catch (e) { console.warn("[minarvabiz] remote warehouse transfer write failed", e); }
}

export async function remoteUpsertPurchaseOrder(po: PurchaseOrder) {
  enqueueOutbox("purchase_orders", po.id, "update", po);
  for (const line of po.lines) {
    enqueueOutbox("purchase_order_lines", line.id, "update", line);
  }
  try { await writer?.upsertPurchaseOrder?.(po); }
  catch (e) { console.warn("[minarvabiz] remote purchase-order write failed", e); }
}


export async function remoteUpsertGoodsReceipt(receipt: GoodsReceipt) {
  enqueueOutbox("goods_receipts", receipt.id, "insert", receipt);
  for (const line of receipt.lines) {
    enqueueOutbox("goods_receipt_lines", line.id, "insert", line);
  }
  try { await writer?.upsertGoodsReceipt?.(receipt); }
  catch (e) { console.warn("[minarvabiz] remote goods-receipt write failed", e); }
}


export async function remoteUpsertPurchaseInvoice(invoice: PurchaseInvoice) {
  enqueueOutbox("purchase_invoices", invoice.id, "update", invoice);
  for (const line of invoice.lines) {
    enqueueOutbox("purchase_invoice_lines", line.id, "update", line);
  }
  try { await writer?.upsertPurchaseInvoice?.(invoice); }
  catch (e) { console.warn("[minarvabiz] remote purchase-invoice write failed", e); }
}


export async function remoteUpsertAccountingAccount(account: AccountingAccount) {
  enqueueOutbox("accounts", account.id, "update", account);
  try { await writer?.upsertAccountingAccount?.(account); }
  catch (e) { console.warn("[minarvabiz] remote accounting account write failed", e); }
}

export async function remoteUpsertJournalEntry(entry: JournalEntry) {
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  for (const line of entry.lines) enqueueOutbox("journal_entry_lines", line.id, "update", line);
  try { await writer?.upsertJournalEntry?.(entry); }
  catch (e) { console.warn("[minarvabiz] remote journal write failed", e); }
}

/** Queue the complete expense posting before awaiting any online I/O. */
export async function remoteCreateExpenseWithJournal(expense: Expense, accounts: AccountingAccount[], entry: JournalEntry) {
  enqueueOutbox("expenses", expense.id, "insert", expense);
  for (const account of accounts) enqueueOutbox("accounts", account.id, "update", account);
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  for (const line of entry.lines) enqueueOutbox("journal_entry_lines", line.id, "update", line);
  const target = writer;
  try {
    await target?.createExpense?.(expense);
    for (const account of accounts) await target?.upsertAccountingAccount?.(account);
    await target?.upsertJournalEntry?.(entry);
  } catch (error) {
    console.warn("[minarvabiz] expense accounting write pending in outbox", error);
  }
}

let collectionWriteQueue: Promise<void> = Promise.resolve();

/** Persist collections and invoice settlements without inserting duplicate sales. */
export async function remoteCollectCustomerPayment(payment: Payment, customer: Customer, settledSales: Sale[]) {
  enqueueOutbox("payments", payment.id, "insert", payment);
  enqueueOutbox("customers", customer.id, "update", customer);
  for (const sale of settledSales) enqueueOutbox("sales", sale.id, "update", sale);
  const target = writer;
  const write = async () => {
    try {
      await target?.createPayment?.(payment);
      for (const sale of settledSales) await target?.updateSaleSettlement?.(sale);
      await target?.upsertCustomer?.(customer);
    } catch (error) {
      console.warn("[minarvabiz] customer collection pending in outbox", error);
    }
  };
  // Prevent a slow earlier collection from overwriting a later settlement.
  collectionWriteQueue = collectionWriteQueue.then(write, write);
  await collectionWriteQueue;
}
