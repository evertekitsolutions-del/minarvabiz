/**
 * Repository interfaces — domain persistence abstraction.
 * Online → Postgres adapter; Offline → SQLite adapter; tests → memory.
 */

import type {
  Customer, Product, Sale, ServiceOrder,
  UUID,
} from "@minarvabiz/types";

export interface CustomerRepository {
  list(query?: string): Promise<Customer[]>;
  get(id: UUID): Promise<Customer | null>;
  create(data: Omit<Customer, "id" | "createdAt" | "updatedAt" | "outstandingBalance" | "totalSpending">): Promise<Customer>;
  update(id: UUID, patch: Partial<Customer>): Promise<Customer | null>;
}

export interface ProductRepository {
  list(opts?: { query?: string; lowStockOnly?: boolean }): Promise<Product[]>;
  get(id: UUID): Promise<Product | null>;
  getByBarcode(code: string): Promise<Product | null>;
  create(data: Partial<Product> & { name: string }): Promise<Product>;
  update(id: UUID, patch: Partial<Product>): Promise<Product | null>;
}

export interface SaleRepository {
  list(): Promise<Sale[]>;
  get(id: UUID): Promise<Sale | null>;
  create(sale: Sale): Promise<Sale>;
}

export interface OrderRepository {
  list(): Promise<ServiceOrder[]>;
  get(id: UUID): Promise<ServiceOrder | null>;
  create(order: ServiceOrder): Promise<ServiceOrder>;
  update(id: UUID, patch: Partial<ServiceOrder>): Promise<ServiceOrder | null>;
}

export interface UnitOfWork {
  customers: CustomerRepository;
  products: ProductRepository;
  sales: SaleRepository;
  orders: OrderRepository;
  /** edition: online | offline | hybrid */
  edition: "online" | "offline" | "hybrid";
}
