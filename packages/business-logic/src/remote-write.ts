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
  StockTransferRecord,
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
  upsertStockTransfer?: (t: StockTransferRecord) => Promise<void>;
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


export async function remoteUpsertStockTransfer(
  transfer: StockTransferRecord,
  operation: "insert" | "update" = "update"
) {
  enqueueOutbox("stock_transfer_requests", transfer.id, operation, transfer);
  try { await writer?.upsertStockTransfer?.(transfer); }
  catch (e) { console.warn("[minarvabiz] remote stock transfer write failed", e); }
}
