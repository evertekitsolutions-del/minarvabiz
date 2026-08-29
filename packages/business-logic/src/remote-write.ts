/**
 * Optional dual-write to Supabase UnitOfWork after local domain mutations.
 * Set via registerRemoteWriter from the web app when online.
 */

import type { Customer, Product, Sale, ServiceOrder } from "@minarvabiz/types";
import { enqueueOutbox } from "./outbox-bridge";

export interface RemoteWriter {
  upsertCustomer?: (c: Customer) => Promise<void>;
  upsertProduct?: (p: Product) => Promise<void>;
  createSale?: (s: Sale) => Promise<void>;
  createOrder?: (o: ServiceOrder) => Promise<void>;
  updateOrder?: (id: string, patch: Partial<ServiceOrder>) => Promise<void>;
  createPayment?: (payload: Record<string, unknown>) => Promise<void>;
  createExpense?: (payload: Record<string, unknown>) => Promise<void>;
  createSupplier?: (payload: Record<string, unknown>) => Promise<void>;
  createLaundry?: (payload: Record<string, unknown>) => Promise<void>;
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
  try {
    await writer?.upsertCustomer?.(c);
  } catch (e) {
    console.warn("[minarvabiz] remote customer write failed", e);
  }
}

export async function remoteUpsertProduct(p: Product) {
  enqueueOutbox("products", p.id, "insert", p);
  try {
    await writer?.upsertProduct?.(p);
  } catch (e) {
    console.warn("[minarvabiz] remote product write failed", e);
  }
}

export async function remoteCreateSale(s: Sale) {
  enqueueOutbox("sales", s.id, "insert", s);
  try {
    await writer?.createSale?.(s);
  } catch (e) {
    console.warn("[minarvabiz] remote sale write failed", e);
  }
}

export async function remoteCreateOrder(o: ServiceOrder) {
  enqueueOutbox("orders", o.id, "insert", o);
  try {
    await writer?.createOrder?.(o);
  } catch (e) {
    console.warn("[minarvabiz] remote order write failed", e);
  }
}
