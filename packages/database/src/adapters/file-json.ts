/**
 * File-JSON adapter — durable offline storage without native modules.
 * Used by Electron until better-sqlite3 is installed in the packaging environment.
 *
 * Storage layout: { dataDir }/minarvabiz-db.json
 */

import type { Customer, Product, Sale, ServiceOrder } from "@minarvabiz/types";
import type {
  CustomerRepository, ProductRepository, SaleRepository,
  OrderRepository, UnitOfWork,
} from "../repository";
import { generateId, nowISO } from "@minarvabiz/utils";

export interface FileJsonStore {
  customers: Customer[];
  products: Product[];
  sales: Sale[];
  orders: ServiceOrder[];
}

export type FileIO = {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
};

export async function createFileJsonUnitOfWork(io: FileIO): Promise<UnitOfWork> {
  let data: FileJsonStore = {
    customers: [],
    products: [],
    sales: [],
    orders: [],
  };

  const raw = await io.read();
  if (raw) {
    try {
      data = { ...data, ...JSON.parse(raw) };
    } catch {
      /* corrupt file — start fresh, caller should backup */
    }
  }

  async function persist() {
    await io.write(JSON.stringify(data, null, 2));
  }

  const customers: CustomerRepository = {
    async list(query) {
      let list = data.customers.filter((c) => !c.deletedAt);
      if (query?.trim()) {
        const q = query.toLowerCase();
        list = list.filter(
          (c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q)
        );
      }
      return list;
    },
    async get(id) {
      return data.customers.find((c) => c.id === id && !c.deletedAt) ?? null;
    },
    async create(input) {
      const c: Customer = {
        id: generateId(),
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        outstandingBalance: 0,
        totalSpending: 0,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      data.customers.push(c);
      await persist();
      return c;
    },
    async update(id, patch) {
      const c = data.customers.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, patch, { updatedAt: nowISO() });
      await persist();
      return c;
    },
  };

  const products: ProductRepository = {
    async list(opts) {
      let list = data.products.filter((p) => !p.deletedAt);
      if (opts?.lowStockOnly) {
        list = list.filter((p) => p.stockQuantity <= p.minimumStock);
      }
      if (opts?.query?.trim()) {
        const q = opts.query.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.barcode?.includes(q)
        );
      }
      return list;
    },
    async get(id) {
      return data.products.find((p) => p.id === id && !p.deletedAt) ?? null;
    },
    async getByBarcode(code) {
      return data.products.find((p) => p.barcode === code && !p.deletedAt) ?? null;
    },
    async create(input) {
      const p = {
        id: generateId(),
        name: input.name,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        unit: input.unit ?? "pcs",
        costPrice: input.costPrice ?? 0,
        sellingPrice: input.sellingPrice ?? 0,
        stockQuantity: input.stockQuantity ?? 0,
        minimumStock: input.minimumStock ?? 0,
        isActive: true,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      } as Product;
      data.products.push(p);
      await persist();
      return p;
    },
    async update(id, patch) {
      const p = data.products.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, patch, { updatedAt: nowISO() });
      await persist();
      return p;
    },
  };

  const sales: SaleRepository = {
    async list() {
      return data.sales.filter((s) => !s.deletedAt);
    },
    async get(id) {
      return data.sales.find((s) => s.id === id) ?? null;
    },
    async create(sale) {
      data.sales.push(sale);
      await persist();
      return sale;
    },
  };

  const orders: OrderRepository = {
    async list() {
      return data.orders.filter((o) => !o.deletedAt);
    },
    async get(id) {
      return data.orders.find((o) => o.id === id) ?? null;
    },
    async create(order) {
      data.orders.push(order);
      await persist();
      return order;
    },
    async update(id, patch) {
      const o = data.orders.find((x) => x.id === id);
      if (!o) return null;
      Object.assign(o, patch, { updatedAt: nowISO() });
      await persist();
      return o;
    },
  };

  return {
    customers,
    products,
    sales,
    orders,
    edition: "offline",
  };
}

/** In-browser / renderer localStorage IO */
export function createLocalStorageIO(key = "minarvabiz-db"): FileIO {
  return {
    async read() {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    },
    async write(content: string) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, content);
    },
  };
}
