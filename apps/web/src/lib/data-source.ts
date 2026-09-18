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
  pgSelect,
  pgUpdate,
  type UnitOfWork,
} from "@minarvabiz/database";
import { store, ordersStore, phase5Store, phase6Store, registerRemoteWriter, getRuntimeMode } from "@minarvabiz/business-logic";
import type { Category, Expense, LaundryOrder, Payment, Purchase, StaffMember, Supplier } from "@minarvabiz/types";

let uowPromise: Promise<UnitOfWork> | null = null;
let uowAccessToken: string | null = null;
let mode: "supabase" | "memory" = "memory";
export function getDataMode(): "supabase" | "memory" { return mode; }

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
    email: (row.email as string) ?? null, address: null, category: (row.category as string) ?? null,
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
    const [categoriesRes, expensesRes, purchasesRes, suppliersRes, laundryRes, staffRes, paymentsRes] = await Promise.all([
      pgSelect<Record<string, unknown>>(cfg, "categories", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "expenses", "select=*&deleted_at=is.null&order=date.desc"),
      pgSelect<Record<string, unknown>>(cfg, "purchases", "select=*&deleted_at=is.null&order=date.desc"),
      pgSelect<Record<string, unknown>>(cfg, "suppliers", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "laundry_orders", "select=*&deleted_at=is.null&order=created_at.desc"),
      pgSelect<Record<string, unknown>>(cfg, "staff_members", "select=*&deleted_at=is.null&order=name.asc"),
      pgSelect<Record<string, unknown>>(cfg, "payments", "select=*&order=created_at.desc"),
    ]);
    for (const result of [categoriesRes, expensesRes, purchasesRes, suppliersRes, laundryRes, staffRes, paymentsRes]) if (result.error) throw new Error(result.error.message);
    store.hydrateCore({ customers, products, categories: (categoriesRes.data || []).map(mapCategory), sales, payments: (paymentsRes.data || []).map(mapPayment) });
    ordersStore.hydrateOrders({ orders });
    phase5Store.hydratePhase5({ expenses: (expensesRes.data || []).map(mapExpense), purchases: (purchasesRes.data || []).map(mapPurchase), suppliers: (suppliersRes.data || []).map(mapSupplier), laundryOrders: (laundryRes.data || []).map(mapLaundry) });
    phase6Store.hydratePhase6({ staff: (staffRes.data || []).map(mapStaff) });

    registerRemoteWriter({
      upsertCustomer: async (customer) => {
        const existing = await db.customers.get(customer.id);
        if (existing) { await db.customers.update(customer.id, customer); return; }
        const res = await pgInsert<Record<string, unknown>>(cfg, "customers", {
          id: customer.id, name: customer.name, phone: customer.phone ?? null, whatsapp: customer.whatsapp ?? null,
          email: customer.email ?? null, address: customer.address ?? null, birthday: customer.birthday ?? null,
          notes: customer.notes ?? null, outstanding_balance: customer.outstandingBalance ?? 0,
          total_spending: customer.totalSpending ?? 0, created_at: customer.createdAt, updated_at: customer.updatedAt,
          branch_id: customer.branchId ?? null, device_id: customer.deviceId ?? null, version: customer.version || 1,
        });
        if (res.error) throw new Error(res.error.message);
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
        const existing = await db.products.get(product.id);
        if (existing) { await db.products.update(product.id, product); return; }
        const res = await pgInsert<Record<string, unknown>>(cfg, "products", {
          id: product.id, name: product.name, sku: product.sku ?? null, barcode: product.barcode ?? null,
          category_id: product.categoryId ?? null, brand: product.brand ?? null, size: product.size ?? null,
          color: product.color ?? null, fabric: product.fabric ?? null, parent_product_id: product.parentProductId ?? null,
          has_variants: product.hasVariants ?? false, unit: product.unit ?? "pcs", cost_price: product.costPrice ?? 0,
          selling_price: product.sellingPrice ?? 0, discount: product.discount ?? null, tax_rate: product.taxRate ?? null,
          stock_quantity: product.stockQuantity ?? 0, minimum_stock: product.minimumStock ?? 0,
          supplier_id: product.supplierId ?? null, image_url: product.imageUrl ?? null, notes: product.notes ?? null,
          is_active: product.isActive !== false, created_at: product.createdAt, updated_at: product.updatedAt,
          branch_id: product.branchId ?? null, device_id: product.deviceId ?? null, version: product.version || 1,
        });
        if (res.error) throw new Error(res.error.message);
      },
      createSale: async (sale) => { await db.sales.create(sale); },
      createOrder: async (order) => { await db.orders.create(order); },
      updateOrder: async (id, patch) => { await db.orders.update(id, patch); },
      createPayment: async (payment) => { const res = await pgInsert<Record<string, unknown>>(cfg, "payments", { id: payment.id, amount: payment.amount, method: payment.method, reference_type: payment.referenceType, reference_id: payment.referenceId, customer_id: payment.customerId ?? null, notes: payment.notes ?? null, paid_at: payment.paidAt, created_at: payment.createdAt, created_by: payment.createdBy ?? null, branch_id: payment.branchId ?? null, device_id: payment.deviceId ?? null, version: payment.version || 1 }); if (res.error) throw new Error(res.error.message); },
      createExpense: async (expense) => { const res = await pgInsert<Record<string, unknown>>(cfg, "expenses", { id: expense.id, category_id: expense.categoryId, description: expense.description ?? "", amount: expense.amount, date: String(expense.date).slice(0, 10), payment_method: expense.paymentMethod, order_id: expense.orderId ?? null, notes: expense.reference ?? null, created_at: expense.createdAt, updated_at: expense.updatedAt, branch_id: expense.branchId ?? null, device_id: expense.deviceId ?? null, version: expense.version || 1 }); if (res.error) throw new Error(res.error.message); },
      createSupplier: async (supplier) => { const res = await pgInsert<Record<string, unknown>>(cfg, "suppliers", { id: supplier.id, name: supplier.name, company: supplier.company ?? null, phone: supplier.phone ?? null, category: supplier.category ?? null, opening_balance: supplier.openingBalance ?? 0, outstanding_balance: supplier.outstandingBalance ?? 0, notes: supplier.notes ?? null, created_at: supplier.createdAt, updated_at: supplier.updatedAt, branch_id: supplier.branchId ?? null }); if (res.error) throw new Error(res.error.message); },
      createLaundry: async (laundry) => { const res = await pgInsert<Record<string, unknown>>(cfg, "laundry_orders", { id: laundry.id, order_number: laundry.orderNumber, customer_id: laundry.customerId, customer_name: laundry.customerName ?? null, supplier_id: laundry.supplierId ?? null, supplier_name: laundry.supplierName ?? null, garment: laundry.garment ?? "Laundry", quantity: laundry.quantity ?? 1, mode: laundry.mode, customer_rate: laundry.customerRate ?? 0, supplier_rate: laundry.supplierRate ?? 0, total_customer_charge: laundry.totalCustomerCharge ?? 0, total_supplier_cost: laundry.totalSupplierCost ?? 0, status: laundry.status ?? "pending", notes: laundry.notes ?? null, paid_amount: laundry.paidAmount ?? 0, balance_amount: laundry.balanceAmount ?? 0, created_at: laundry.createdAt, updated_at: laundry.updatedAt, branch_id: laundry.branchId ?? null, device_id: laundry.deviceId ?? null, version: laundry.version || 1 }); if (res.error) throw new Error(res.error.message); },
      createPurchase: async (purchase) => { const res = await pgInsert<Record<string, unknown>>(cfg, "purchases", { id: purchase.id, supplier_id: purchase.supplierId ?? null, doc_number: purchase.purchaseNumber, kind: purchase.kind, order_id: purchase.orderId ?? null, total: purchase.amount, paid: purchase.paidAmount, balance: purchase.balanceAmount, payment_method: purchase.paymentMethod, date: String(purchase.date).slice(0, 10), notes: purchase.notes ?? purchase.description ?? null, created_at: purchase.createdAt, updated_at: purchase.updatedAt, branch_id: purchase.branchId ?? null, device_id: purchase.deviceId ?? null, version: purchase.version || 1 }); if (res.error) throw new Error(res.error.message); },
    });
    return { ok: true, message: "Hydrated from Supabase", counts: { customers: customers.length, products: products.length, categories: categoriesRes.data?.length || 0, sales: sales.length, orders: orders.length, expenses: expensesRes.data?.length || 0, purchases: purchasesRes.data?.length || 0, suppliers: suppliersRes.data?.length || 0, laundry: laundryRes.data?.length || 0, staff: staffRes.data?.length || 0, payments: paymentsRes.data?.length || 0 } };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

export async function supabaseLogin(email: string, password: string) {
  const cfg = configFromEnv(); if (!cfg) return { ok: false as const, error: "Supabase not configured" };
  const res = await authSignIn(cfg, email, password); if (res.error || !res.data) return { ok: false as const, error: res.error?.message || "Login failed" };
  return { ok: true as const, token: res.data.access_token, user: res.data.user };
}
