/**
 * Optional dual-write to Supabase UnitOfWork after local domain mutations.
 * Set via registerRemoteWriter from the web app when online.
 */

import type { Customer, Product, Sale, ServiceOrder } from "@minarvabiz/types";

export interface RemoteWriter {
  upsertCustomer?: (c: Customer) => Promise<void>;
  upsertProduct?: (p: Product) => Promise<void>;
  createSale?: (s: Sale) => Promise<void>;
  createOrder?: (o: ServiceOrder) => Promise<void>;
  updateOrder?: (id: string, patch: Partial<ServiceOrder>) => Promise<void>;
}

let writer: RemoteWriter | null = null;

export function registerRemoteWriter(w: RemoteWriter | null) {
  writer = w;
}

export function getRemoteWriter(): RemoteWriter | null {
  return writer;
}

export async function remoteUpsertCustomer(c: Customer) {
  try {
    await writer?.upsertCustomer?.(c);
  } catch (e) {
    console.warn("[minarvabiz] remote customer write failed", e);
  }
}

export async function remoteUpsertProduct(p: Product) {
  try {
    await writer?.upsertProduct?.(p);
  } catch (e) {
    console.warn("[minarvabiz] remote product write failed", e);
  }
}

export async function remoteCreateSale(s: Sale) {
  try {
    await writer?.createSale?.(s);
  } catch (e) {
    console.warn("[minarvabiz] remote sale write failed", e);
  }
}

export async function remoteCreateOrder(o: ServiceOrder) {
  try {
    await writer?.createOrder?.(o);
  } catch (e) {
    console.warn("[minarvabiz] remote order write failed", e);
  }
}
