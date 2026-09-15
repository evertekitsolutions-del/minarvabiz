/**
 * Real Supabase UnitOfWork via PostgREST.
 * Falls back to memory only when config is missing/placeholder.
 */

import type { Sale } from "@minarvabiz/types";
import type {
  CustomerRepository, ProductRepository, SaleRepository,
  OrderRepository, UnitOfWork,
} from "../repository";
import {
  configFromEnv,
  isSupabaseConfigured,
  pgSelect,
  pgInsert,
  pgUpdate,
  type SupabaseConfig,
} from "../client/postgrest";
import {
  mapCustomer, customerToRow,
  mapProduct, productToRow,
  mapSale, mapSaleItem, mapOrder,
} from "../client/mappers";
import { createMemoryUnitOfWork } from "./memory";
import { generateId, nowISO } from "@minarvabiz/utils";

export type { SupabaseConfig };
export { configFromEnv as supabaseConfigFromEnv, isSupabaseConfigured };

function createCustomerRepo(cfg: SupabaseConfig): CustomerRepository {
  return {
    async list(query) {
      let q = "select=*&deleted_at=is.null&order=created_at.desc";
      if (query?.trim()) {
        const enc = encodeURIComponent(`%${query.trim()}%`);
        q += `&or=(name.ilike.${enc},phone.ilike.${enc})`;
      }
      const res = await pgSelect<Record<string, unknown>>(cfg, "customers", q);
      if (res.error || !res.data) return [];
      return res.data.map(mapCustomer);
    },
    async get(id) {
      const res = await pgSelect<Record<string, unknown>>(cfg, "customers", `select=*&id=eq.${id}&deleted_at=is.null`);
      if (res.error || !res.data?.[0]) return null;
      return mapCustomer(res.data[0]);
    },
    async create(data) {
      const row = {
        id: generateId(), name: data.name, phone: data.phone ?? null, email: data.email ?? null,
        address: data.address ?? null, notes: data.notes ?? null, outstanding_balance: 0,
        total_spending: 0, created_at: nowISO(), updated_at: nowISO(), version: 1,
      };
      const res = await pgInsert<Record<string, unknown>>(cfg, "customers", row);
      if (res.error || !res.data?.[0]) throw new Error(res.error?.message || "Failed to create customer");
      return mapCustomer(res.data[0]);
    },
    async update(id, patch) {
      const res = await pgUpdate<Record<string, unknown>>(cfg, "customers", `id=eq.${id}`, customerToRow(patch));
      if (res.error || !res.data?.[0]) return null;
      return mapCustomer(res.data[0]);
    },
  };
}

function createProductRepo(cfg: SupabaseConfig): ProductRepository {
  return {
    async list(opts) {
      let q = "select=*&deleted_at=is.null&order=name.asc";
      if (opts?.query?.trim()) {
        const enc = encodeURIComponent(`%${opts.query.trim()}%`);
        q += `&or=(name.ilike.${enc},sku.ilike.${enc},barcode.ilike.${enc})`;
      }
      const res = await pgSelect<Record<string, unknown>>(cfg, "products", q);
      if (res.error || !res.data) return [];
      let list = res.data.map(mapProduct);
      if (opts?.lowStockOnly) list = list.filter((p) => p.stockQuantity <= p.minimumStock);
      return list;
    },
    async get(id) {
      const res = await pgSelect<Record<string, unknown>>(cfg, "products", `select=*&id=eq.${id}&deleted_at=is.null`);
      if (res.error || !res.data?.[0]) return null;
      return mapProduct(res.data[0]);
    },
    async getByBarcode(code) {
      const res = await pgSelect<Record<string, unknown>>(cfg, "products", `select=*&barcode=eq.${encodeURIComponent(code)}&deleted_at=is.null`);
      if (res.error || !res.data?.[0]) return null;
      return mapProduct(res.data[0]);
    },
    async create(data) {
      const row = {
        id: generateId(), name: data.name, sku: data.sku ?? null, barcode: data.barcode ?? null,
        brand: data.brand ?? null, size: data.size ?? null, color: data.color ?? null,
        fabric: data.fabric ?? null, parent_product_id: data.parentProductId ?? null,
        has_variants: data.hasVariants ?? false, unit: data.unit ?? "pcs",
        cost_price: data.costPrice ?? 0, selling_price: data.sellingPrice ?? 0,
        discount: data.discount ?? null, tax_rate: data.taxRate ?? null,
        stock_quantity: data.stockQuantity ?? 0, minimum_stock: data.minimumStock ?? 0,
        supplier_id: data.supplierId ?? null, image_url: data.imageUrl ?? null,
        notes: data.notes ?? null, is_active: true, created_at: nowISO(), updated_at: nowISO(), version: 1,
      };
      const res = await pgInsert<Record<string, unknown>>(cfg, "products", row);
      if (res.error || !res.data?.[0]) throw new Error(res.error?.message || "Failed to create product");
      return mapProduct(res.data[0]);
    },
    async update(id, patch) {
      const res = await pgUpdate<Record<string, unknown>>(cfg, "products", `id=eq.${id}`, productToRow(patch));
      if (res.error || !res.data?.[0]) return null;
      return mapProduct(res.data[0]);
    },
  };
}

function createSaleRepo(cfg: SupabaseConfig): SaleRepository {
  return {
    async list() {
      const res = await pgSelect<Record<string, unknown>>(cfg, "sales", "select=*&deleted_at=is.null&order=sale_date.desc");
      if (res.error || !res.data) return [];
      const sales: Sale[] = [];
      for (const row of res.data) {
        const itemsRes = await pgSelect<Record<string, unknown>>(cfg, "sale_items", `select=*&sale_id=eq.${row.id}`);
        sales.push(mapSale(row, (itemsRes.data || []).map(mapSaleItem)));
      }
      return sales;
    },
    async get(id) {
      const res = await pgSelect<Record<string, unknown>>(cfg, "sales", `select=*&id=eq.${id}`);
      if (res.error || !res.data?.[0]) return null;
      const itemsRes = await pgSelect<Record<string, unknown>>(cfg, "sale_items", `select=*&sale_id=eq.${id}`);
      return mapSale(res.data[0], (itemsRes.data || []).map(mapSaleItem));
    },
    async create(sale) {
      const saleRow = {
        id: sale.id, invoice_number: sale.invoiceNumber, customer_id: sale.customerId, customer_name: sale.customerName,
        sale_date: sale.saleDate, subtotal: sale.subtotal, discount_amount: sale.discountAmount,
        tax_amount: sale.taxAmount, total: sale.total, paid_amount: sale.paidAmount,
        balance_amount: sale.balanceAmount, status: sale.status, notes: sale.notes,
        created_at: sale.createdAt, updated_at: sale.updatedAt, version: sale.version || 1,
      };
      const res = await pgInsert<Record<string, unknown>>(cfg, "sales", saleRow);
      if (res.error) throw new Error(res.error.message);
      if (sale.items?.length) {
        const itemRows = sale.items.map((i) => ({
          id: i.id, sale_id: sale.id, product_id: i.productId, product_name: i.productName,
          sku: i.sku, quantity: i.quantity, unit_price: i.unitPrice, cost_price: i.costPrice,
          discount_percent: i.discountPercent, tax_rate: i.taxRate, line_total: i.lineTotal,
        }));
        await pgInsert(cfg, "sale_items", itemRows);
        for (const i of sale.items) {
          const prod = await pgSelect<Record<string, unknown>>(cfg, "products", `select=*&id=eq.${i.productId}`);
          if (prod.data?.[0]) {
            const current = Number(prod.data[0].stock_quantity || 0);
            const next = current - i.quantity;
            await pgUpdate(cfg, "products", `id=eq.${i.productId}`, { stock_quantity: next, updated_at: nowISO() });
            await pgInsert(cfg, "inventory_transactions", {
              id: generateId(), product_id: i.productId, movement_type: "sale", quantity: i.quantity,
              balance_after: next, reference_type: "sale", reference_id: sale.id, created_at: nowISO(),
            });
          }
        }
      }
      if (sale.customerId && sale.balanceAmount > 0) {
        const cust = await pgSelect<Record<string, unknown>>(cfg, "customers", `select=*&id=eq.${sale.customerId}`);
        if (cust.data?.[0]) {
          const bal = Number(cust.data[0].outstanding_balance || 0) + sale.balanceAmount;
          const spend = Number(cust.data[0].total_spending || 0) + sale.paidAmount;
          await pgUpdate(cfg, "customers", `id=eq.${sale.customerId}`, { outstanding_balance: bal, total_spending: spend, updated_at: nowISO() });
        }
      }
      // Payment is persisted by the business-logic payment writer so its selected method is retained.
      return sale;
    },
  };
}

function createOrderRepo(cfg: SupabaseConfig): OrderRepository {
  return {
    async list() {
      const res = await pgSelect<Record<string, unknown>>(cfg, "orders", "select=*&deleted_at=is.null&order=order_date.desc");
      if (res.error || !res.data) return [];
      return res.data.map(mapOrder);
    },
    async get(id) {
      const res = await pgSelect<Record<string, unknown>>(cfg, "orders", `select=*&id=eq.${id}`);
      if (res.error || !res.data?.[0]) return null;
      return mapOrder(res.data[0]);
    },
    async create(order) {
      const row = {
        id: order.id,
        order_number: order.orderNumber,
        customer_id: order.customerId,
        customer_name: order.customerName,
        order_date: order.orderDate,
        delivery_date: order.deliveryDate,
        service_type: order.serviceType,
        status: order.status,
        assigned_tailor_id: order.assignedTailorId ?? null,
        measurement_profile_id: order.measurementProfileId ?? null,
        measurements_json: order.measurements ?? null,
        notes: order.notes,
        material_details: order.materialDetails,
        customer_supplied_material: order.customerSuppliedMaterial,
        shop_supplied_material: order.shopSuppliedMaterial,
        price: order.price,
        discount: order.discount,
        advance: order.advance,
        balance: order.balance,
        external_material_cost: order.externalMaterialCost,
        order_expenses_total: order.orderExpensesTotal,
        quantity: order.quantity,
        unit_price: order.unitPrice,
        bulk_discount: order.bulkDiscount,
        tshirt_json: order.tshirt ?? null,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
        branch_id: order.branchId ?? null,
        device_id: order.deviceId ?? null,
        created_by: order.createdBy ?? null,
        version: order.version || 1,
      };
      const res = await pgInsert(cfg, "orders", row);
      if (res.error) throw new Error(res.error.message);
      return order;
    },
    async update(id, patch) {
      const row: Record<string, unknown> = { updated_at: nowISO() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.price !== undefined) row.price = patch.price;
      if (patch.discount !== undefined) row.discount = patch.discount;
      if (patch.advance !== undefined) row.advance = patch.advance;
      if (patch.balance !== undefined) row.balance = patch.balance;
      if (patch.externalMaterialCost !== undefined) row.external_material_cost = patch.externalMaterialCost;
      if (patch.orderExpensesTotal !== undefined) row.order_expenses_total = patch.orderExpensesTotal;
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.deliveryDate !== undefined) row.delivery_date = patch.deliveryDate;
      if (patch.assignedStaffId !== undefined) row.assigned_staff_id = patch.assignedStaffId;
      if (patch.assignedTailorId !== undefined) row.assigned_tailor_id = patch.assignedTailorId;
      if (patch.materialDetails !== undefined) row.material_details = patch.materialDetails;
      if (patch.customerSuppliedMaterial !== undefined) row.customer_supplied_material = patch.customerSuppliedMaterial;
      if (patch.shopSuppliedMaterial !== undefined) row.shop_supplied_material = patch.shopSuppliedMaterial;
      if (patch.quantity !== undefined) row.quantity = patch.quantity;
      if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice;
      if (patch.bulkDiscount !== undefined) row.bulk_discount = patch.bulkDiscount;
      if (patch.measurements !== undefined) row.measurements_json = patch.measurements;
      if (patch.measurementProfileId !== undefined) row.measurement_profile_id = patch.measurementProfileId;
      if (patch.tshirt !== undefined) row.tshirt_json = patch.tshirt;
      const res = await pgUpdate<Record<string, unknown>>(cfg, "orders", `id=eq.${id}`, row);
      if (res.error || !res.data?.[0]) return null;
      return mapOrder(res.data[0]);
    },
  };
}

export async function createSupabaseUnitOfWork(config?: SupabaseConfig | null): Promise<UnitOfWork> {
  const cfg = config ?? configFromEnv();
  if (!cfg) {
    console.info("[minarvabiz] Supabase not configured — using memory UnitOfWork");
    return { ...createMemoryUnitOfWork(), edition: "online" };
  }
  return { customers: createCustomerRepo(cfg), products: createProductRepo(cfg), sales: createSaleRepo(cfg), orders: createOrderRepo(cfg), edition: "online" };
}

export async function verifySupabaseConnection(cfg?: SupabaseConfig | null): Promise<{ ok: boolean; message: string }> {
  const c = cfg ?? configFromEnv();
  if (!c) return { ok: false, message: "Supabase env not configured" };
  const res = await pgSelect(c, "customers", "select=id&limit=1");
  if (res.error) return { ok: false, message: `Connection failed: ${res.error.message}. Apply migrations in supabase/migrations/` };
  return { ok: true, message: "Supabase reachable" };
}
