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
  pgRpc,
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


function optimisticMatch(id: string, version: number | undefined, label: string): string {
  if (!Number.isInteger(version) || Number(version) < 2) {
    throw new Error(`${label} update requires an incremented version`);
  }
  return `id=eq.${id}&version=eq.${Number(version) - 1}`;
}

function assertUpdated<T>(data: T[] | null, label: string): T | null {
  if (!data?.length) throw new Error(`${label} version conflict`);
  return data[0] ?? null;
}

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
      const res = await pgUpdate<Record<string, unknown>>(cfg, "customers", optimisticMatch(id, patch.version, "Customer"), customerToRow(patch));
      if (res.error) throw new Error(res.error.message);
      const row = assertUpdated(res.data, "Customer");
      return row ? mapCustomer(row) : null;
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
      const res = await pgUpdate<Record<string, unknown>>(cfg, "products", optimisticMatch(id, patch.version, "Product"), productToRow(patch));
      if (res.error) throw new Error(res.error.message);
      const row = assertUpdated(res.data, "Product");
      return row ? mapProduct(row) : null;
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
      if (sale.paidAmount > 0) {
        throw new Error("Paid online sales must use the atomic sale writer so payment and stock commit together");
      }
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
          items: (sale.items || []).map((i) => ({
            id: i.id,
            product_id: i.productId,
            product_name: i.productName,
            sku: i.sku ?? null,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            cost_price: i.costPrice,
            discount_percent: i.discountPercent,
            tax_rate: i.taxRate,
            line_total: i.lineTotal,
          })),
        },
        p_payments: [],
        p_allow_negative_stock: false,
      });
      if (result.error) throw new Error(result.error.message);
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
      if (patch.version !== undefined) row.version = patch.version;
      const res = await pgUpdate<Record<string, unknown>>(cfg, "orders", optimisticMatch(id, patch.version, "Order"), row);
      if (res.error) throw new Error(res.error.message);
      const updated = assertUpdated(res.data, "Order");
      return updated ? mapOrder(updated) : null;
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
