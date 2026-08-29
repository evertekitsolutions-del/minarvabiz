/**
 * Data source bootstrap — Supabase when configured, else in-memory domain stores.
 */

import {
  createDatabase,
  isSupabaseConfigured,
  verifySupabaseConnection,
  authSignIn,
  configFromEnv,
  type UnitOfWork,
} from "@minarvabiz/database";
import { store, ordersStore, registerRemoteWriter } from "@minarvabiz/business-logic";

let uowPromise: Promise<UnitOfWork> | null = null;
let mode: "supabase" | "memory" = "memory";

export function getDataMode(): "supabase" | "memory" {
  return mode;
}

export async function getUnitOfWork(): Promise<UnitOfWork> {
  if (!uowPromise) {
    if (isSupabaseConfigured()) {
      mode = "supabase";
      uowPromise = createDatabase({ edition: "online" });
    } else {
      mode = "memory";
      uowPromise = createDatabase({ edition: "memory" });
    }
  }
  return uowPromise;
}

/** Pull remote data into in-memory stores so existing UI keeps working */
export async function hydrateStoresFromSupabase(): Promise<{
  ok: boolean;
  message: string;
  counts?: Record<string, number>;
}> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Supabase not configured — using local demo stores" };
  }
  const check = await verifySupabaseConnection();
  if (!check.ok) return { ok: false, message: check.message };

  const db = await getUnitOfWork();
  try {
    const [customers, products, sales, orders] = await Promise.all([
      db.customers.list(),
      db.products.list(),
      db.sales.list(),
      db.orders.list(),
    ]);
    store.hydrateCore({
      customers,
      products,
      sales,
    });
    ordersStore.hydrateOrders({ orders });
    registerRemoteWriter({
      createSale: async (s) => { await db.sales.create(s); },
      createOrder: async (o) => { await db.orders.create(o); },
      updateOrder: async (id, patch) => { await db.orders.update(id, patch); },
    });
    return {
      ok: true,
      message: "Hydrated from Supabase",
      counts: {
        customers: customers.length,
        products: products.length,
        sales: sales.length,
        orders: orders.length,
      },
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function supabaseLogin(email: string, password: string) {
  const cfg = configFromEnv();
  if (!cfg) return { ok: false as const, error: "Supabase not configured" };
  const res = await authSignIn(cfg, email, password);
  if (res.error || !res.data) {
    return { ok: false as const, error: res.error?.message || "Login failed" };
  }
  return {
    ok: true as const,
    token: res.data.access_token,
    user: res.data.user,
  };
}
