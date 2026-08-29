/**
 * Memory unit of work — bridges existing business-logic stores
 * until Drizzle SQLite/Postgres adapters are wired in deployment.
 */

import type {
  Customer, Product, Sale, ServiceOrder, UUID,
} from "@minarvabiz/types";
import type {
  CustomerRepository, ProductRepository, SaleRepository,
  OrderRepository, UnitOfWork,
} from "../repository";
import { generateId, nowISO } from "@minarvabiz/utils";

export function createMemoryUnitOfWork(
  hooks?: {
    listCustomers?: (q?: string) => Customer[];
    getCustomer?: (id: UUID) => Customer | undefined;
    createCustomer?: (data: { name: string }) => Customer;
    listProducts?: (opts?: { query?: string; lowStockOnly?: boolean }) => Product[];
    getProduct?: (id: UUID) => Product | undefined;
    getProductByBarcode?: (c: string) => Product | undefined;
    listSales?: () => Sale[];
    getSale?: (id: UUID) => Sale | undefined;
    listOrders?: () => ServiceOrder[];
    getOrder?: (id: UUID) => ServiceOrder | undefined;
  }
): UnitOfWork {
  const customers: Customer[] = [];
  const products: Product[] = [];
  const sales: Sale[] = [];
  const orders: ServiceOrder[] = [];

  const customerRepo: CustomerRepository = {
    async list(query) {
      if (hooks?.listCustomers) return hooks.listCustomers(query);
      let list = customers.filter((c) => !c.deletedAt);
      if (query) {
        const q = query.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q));
      }
      return list;
    },
    async get(id) {
      if (hooks?.getCustomer) return hooks.getCustomer(id) ?? null;
      return customers.find((c) => c.id === id && !c.deletedAt) ?? null;
    },
    async create(data) {
      if (hooks?.createCustomer) return hooks.createCustomer({ name: data.name });
      const c: Customer = {
        id: generateId(),
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        outstandingBalance: 0,
        totalSpending: 0,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      customers.push(c);
      return c;
    },
    async update(id, patch) {
      const c = await this.get(id);
      if (!c) return null;
      Object.assign(c, patch, { updatedAt: nowISO() });
      return c;
    },
  };

  const productRepo: ProductRepository = {
    async list(opts) {
      if (hooks?.listProducts) return hooks.listProducts(opts);
      return products.filter((p) => !p.deletedAt);
    },
    async get(id) {
      if (hooks?.getProduct) return hooks.getProduct(id) ?? null;
      return products.find((p) => p.id === id) ?? null;
    },
    async getByBarcode(code) {
      if (hooks?.getProductByBarcode) return hooks.getProductByBarcode(code) ?? null;
      return products.find((p) => p.barcode === code) ?? null;
    },
    async create(data) {
      const p = {
        id: generateId(),
        name: data.name,
        sku: data.sku ?? null,
        barcode: data.barcode ?? null,
        unit: data.unit ?? "pcs",
        costPrice: data.costPrice ?? 0,
        sellingPrice: data.sellingPrice ?? 0,
        stockQuantity: data.stockQuantity ?? 0,
        minimumStock: data.minimumStock ?? 0,
        isActive: true,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      } as Product;
      products.push(p);
      return p;
    },
    async update(id, patch) {
      const p = await this.get(id);
      if (!p) return null;
      Object.assign(p, patch, { updatedAt: nowISO() });
      return p;
    },
  };

  const saleRepo: SaleRepository = {
    async list() {
      if (hooks?.listSales) return hooks.listSales();
      return [...sales];
    },
    async get(id) {
      if (hooks?.getSale) return hooks.getSale(id) ?? null;
      return sales.find((s) => s.id === id) ?? null;
    },
    async create(sale) {
      sales.push(sale);
      return sale;
    },
  };

  const orderRepo: OrderRepository = {
    async list() {
      if (hooks?.listOrders) return hooks.listOrders();
      return [...orders];
    },
    async get(id) {
      if (hooks?.getOrder) return hooks.getOrder(id) ?? null;
      return orders.find((o) => o.id === id) ?? null;
    },
    async create(order) {
      orders.push(order);
      return order;
    },
    async update(id, patch) {
      const o = await this.get(id);
      if (!o) return null;
      Object.assign(o, patch, { updatedAt: nowISO() });
      return o;
    },
  };

  return {
    customers: customerRepo,
    products: productRepo,
    sales: saleRepo,
    orders: orderRepo,
    edition: "hybrid",
  };
}
