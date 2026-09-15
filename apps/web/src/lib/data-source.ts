/**
 * Data source bootstrap — Supabase when configured, else in-memory domain stores.
 */

import {
  createDatabase,
  isSupabaseConfigured,
  verifySupabaseConnection,
  authSignIn,
  configFromEnv,
  pgInsert,
  type UnitOfWork,
} from "@minarvabiz/database";
import { store, ordersStore, registerRemoteWriter, getRuntimeMode } from "@minarvabiz/business-logic";

let uowPromise: Promise<UnitOfWork> | null = null;
let mode: "supabase" | "memory" = "memory";

export function getDataMode(): "supabase" | "memory" { return mode; }

export async function getUnitOfWork(): Promise<UnitOfWork> {
  if (!uowPromise) {
    if (isSupabaseConfigured()) {
      mode = "supabase";
      uowPromise = createDatabase({ edition: "online" });
    } else if (getRuntimeMode() === "demo" || getRuntimeMode() === "development") {
      mode = "memory";
      uowPromise = createDatabase({ edition: "memory" });
    } else {
      throw new Error("Online production requires Supabase configuration; use the Windows desktop app for offline mode.");
    }
  }
  return uowPromise;
}

/** Pull remote data into in-memory stores so existing UI keeps working. */
export async function hydrateStoresFromSupabase(): Promise<{ ok: boolean; message: string; counts?: Record<string, number> }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase is not configured for online production." };
  const check = await verifySupabaseConnection();
  if (!check.ok) return { ok: false, message: check.message };

  const db = await getUnitOfWork();
  const cfg = configFromEnv();
  if (!cfg) return { ok: false, message: "Supabase configuration is unavailable." };

  try {
    const [customers, products, sales, orders] = await Promise.all([
      db.customers.list(), db.products.list(), db.sales.list(), db.orders.list(),
    ]);
    store.hydrateCore({ customers, products, sales });
    ordersStore.hydrateOrders({ orders });
    registerRemoteWriter({
      upsertCustomer: async (customer) => {
        const existing = await db.customers.get(customer.id);
        if (existing) {
          await db.customers.update(customer.id, customer);
          return;
        }
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, outstandingBalance: _outstandingBalance, totalSpending: _totalSpending, ...createData } = customer;
        await db.customers.create(createData);
      },
      upsertProduct: async (product) => {
        const existing = await db.products.get(product.id);
        if (existing) await db.products.update(product.id, product);
        else await db.products.create(product);
      },
      createSale: async (sale) => { await db.sales.create(sale); },
      createOrder: async (order) => { await db.orders.create(order); },
      updateOrder: async (id, patch) => { await db.orders.update(id, patch); },
      createPayment: async (payment) => {
        const res = await pgInsert<Record<string, unknown>>(cfg, "payments", {
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
          version: payment.version || 1,
        });
        if (res.error) throw new Error(res.error.message);
      },
      createExpense: async (payload) => {
        const expense = payload as {
          id: string; categoryId?: string | null; description?: string | null; amount: number;
          date: string; paymentMethod?: string | null; orderId?: string | null; reference?: string | null;
          createdAt: string; updatedAt: string; branchId?: string | null; deviceId?: string | null; version?: number;
        };
        const res = await pgInsert<Record<string, unknown>>(cfg, "expenses", {
          id: expense.id,
          category_id: expense.categoryId ?? null,
          description: expense.description ?? "",
          amount: expense.amount,
          date: String(expense.date).slice(0, 10),
          payment_method: expense.paymentMethod ?? null,
          order_id: expense.orderId ?? null,
          notes: expense.reference ?? null,
          created_at: expense.createdAt,
          updated_at: expense.updatedAt,
          branch_id: expense.branchId ?? null,
          device_id: expense.deviceId ?? null,
          version: expense.version || 1,
        });
        if (res.error) throw new Error(res.error.message);
      },
      createSupplier: async (payload) => {
        const supplier = payload as {
          id: string; name: string; company?: string | null; phone?: string | null; category?: string | null;
          openingBalance?: number; outstandingBalance?: number; notes?: string | null; createdAt: string;
          updatedAt: string; branchId?: string | null;
        };
        const res = await pgInsert<Record<string, unknown>>(cfg, "suppliers", {
          id: supplier.id,
          name: supplier.name,
          company: supplier.company ?? null,
          phone: supplier.phone ?? null,
          category: supplier.category ?? null,
          opening_balance: supplier.openingBalance ?? 0,
          outstanding_balance: supplier.outstandingBalance ?? 0,
          notes: supplier.notes ?? null,
          created_at: supplier.createdAt,
          updated_at: supplier.updatedAt,
          branch_id: supplier.branchId ?? null,
        });
        if (res.error) throw new Error(res.error.message);
      },
      createLaundry: async (payload) => {
        const laundry = payload as {
          id: string; customerId: string; supplierId?: string | null; garment?: string | null; quantity: number;
          customerRate: number; supplierRate: number; totalCustomerCharge: number; totalSupplierCost: number;
          status: string; notes?: string | null; createdAt: string; updatedAt: string; branchId?: string | null;
          deviceId?: string | null; version?: number;
        };
        const res = await pgInsert<Record<string, unknown>>(cfg, "laundry_orders", {
          id: laundry.id,
          customer_id: laundry.customerId,
          supplier_id: laundry.supplierId ?? null,
          garment: laundry.garment ?? "Laundry",
          quantity: laundry.quantity ?? 1,
          customer_rate: laundry.customerRate ?? 0,
          supplier_rate: laundry.supplierRate ?? 0,
          total_customer_charge: laundry.totalCustomerCharge ?? 0,
          total_supplier_cost: laundry.totalSupplierCost ?? 0,
          status: laundry.status ?? "pending",
          notes: laundry.notes ?? null,
          created_at: laundry.createdAt,
          updated_at: laundry.updatedAt,
          branch_id: laundry.branchId ?? null,
          device_id: laundry.deviceId ?? null,
          version: laundry.version || 1,
        });
        if (res.error) throw new Error(res.error.message);
      },
    });
    return { ok: true, message: "Hydrated from Supabase", counts: { customers: customers.length, products: products.length, sales: sales.length, orders: orders.length } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function supabaseLogin(email: string, password: string) {
  const cfg = configFromEnv();
  if (!cfg) return { ok: false as const, error: "Supabase not configured" };
  const res = await authSignIn(cfg, email, password);
  if (res.error || !res.data) return { ok: false as const, error: res.error?.message || "Login failed" };
  return { ok: true as const, token: res.data.access_token, user: res.data.user };
}
