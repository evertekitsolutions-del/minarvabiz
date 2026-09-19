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
  SupplierInvoice,
} from "@minarvabiz/types";
import { enqueueOutbox } from "./outbox-bridge";

export interface RemoteWriter {
  upsertCustomer?: (c: Customer) => Promise<void>;
  upsertCategory?: (c: Category) => Promise<void>;
  upsertProduct?: (p: Product) => Promise<void>;
  createSale?: (s: Sale) => Promise<void>;
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
  upsertSupplierInvoice?: (invoice: SupplierInvoice) => Promise<void>;
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


export async function remoteUpsertSupplierInvoice(invoice: SupplierInvoice) {
  enqueueOutbox("supplier_invoices", invoice.id, "update", invoice);
  for (const line of invoice.lines) {
    enqueueOutbox("supplier_invoice_lines", line.id, "update", line);
  }
  try { await writer?.upsertSupplierInvoice?.(invoice); }
  catch (e) { console.warn("[minarvabiz] remote supplier-invoice write failed", e); }
}
