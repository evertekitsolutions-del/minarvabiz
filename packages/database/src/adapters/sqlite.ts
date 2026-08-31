/**
 * Real SQLite transactional store (sql.js = SQLite engine, file-backed).
 * Node-only module — do not import from client components.
 */

import type {
  Customer, Product, Sale, SaleItem, ServiceOrder, UUID,
} from "@minarvabiz/types";
import type {
  CustomerRepository, ProductRepository, SaleRepository,
  OrderRepository, UnitOfWork,
} from "../repository";
import { SQLITE_DDL, SQLITE_SCHEMA_VERSION } from "../sql/sqlite-ddl";
import { generateId, nowISO } from "@minarvabiz/utils";

export interface SqliteFileIO {
  readFile(p: string): Buffer | null;
  writeFile(p: string, data: Uint8Array): void;
  exists(p: string): boolean;
  mkdirp(dir: string): void;
}

export function nodeFileIO(): SqliteFileIO {
  // Dynamic requires keep webpack from resolving fs at client compile time
  // when this function is never called from the browser.
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  return {
    readFile(p) {
      try {
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p);
      } catch {
        return null;
      }
    },
    writeFile(p, data) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(data));
    },
    exists(p) {
      return fs.existsSync(p);
    },
    mkdirp(dir) {
      fs.mkdirSync(dir, { recursive: true });
    },
  };
}

type SqlJsDb = {
  run: (sql: string, params?: unknown[]) => void;
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  prepare: (sql: string) => {
    bind: (params: unknown[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
  close: () => void;
};

let SQL: { Database: new (data?: ArrayLike<number>) => SqlJsDb } | null = null;

async function loadSqlJs() {
  if (SQL) return SQL;
  const initSqlJs = require("sql.js");
  SQL = await initSqlJs();
  return SQL!;
}

function rowsFromExec(db: SqlJsDb, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: Record<string, unknown>[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function persist(db: SqlJsDb, dbPath: string, io: SqliteFileIO) {
  io.writeFile(dbPath, db.export());
}

export interface SqliteDatabase {
  db: SqlJsDb;
  path: string;
  save: () => void;
  close: () => void;
  exec: (sql: string, params?: unknown[]) => void;
  query: (sql: string, params?: unknown[]) => Record<string, unknown>[];
  transaction: <T>(fn: () => T) => T;
}

export async function openSqliteDatabase(
  dbPath: string,
  io: SqliteFileIO = nodeFileIO()
): Promise<SqliteDatabase> {
  const sqlJs = await loadSqlJs();
  // Pure dirname — works in Node and avoids renderer require("path") crashes
  const dir = (() => {
    const i = Math.max(dbPath.lastIndexOf("/"), dbPath.lastIndexOf("\\"));
    return i >= 0 ? dbPath.slice(0, i) : ".";
  })();
  try {
    io.mkdirp(dir);
  } catch {
    /* renderer IO may no-op */
  }
  const existing = io.readFile(dbPath);
  const db = existing ? new sqlJs.Database(existing) : new sqlJs.Database();
  db.run("PRAGMA foreign_keys = ON;");
  for (const s of SQLITE_DDL.split(";").map((x) => x.trim()).filter(Boolean)) {
    try {
      db.run(s);
    } catch {
      /* IF NOT EXISTS */
    }
  }
  db.run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [
    "schema_version",
    String(SQLITE_SCHEMA_VERSION),
  ]);
  const save = () => persist(db, dbPath, io);
  const api: SqliteDatabase = {
    db,
    path: dbPath,
    save,
    close() {
      save();
      db.close();
    },
    exec(sql, params = []) {
      db.run(sql, params);
    },
    query(sql, params = []) {
      return rowsFromExec(db, sql, params);
    },
    transaction<T>(fn: () => T): T {
      db.run("BEGIN");
      try {
        const result = fn();
        db.run("COMMIT");
        save();
        return result;
      } catch (e) {
        try {
          db.run("ROLLBACK");
        } catch {
          /* */
        }
        throw e;
      }
    },
  };
  save();
  return api;
}

function mapCustomer(r: Record<string, unknown>): Customer {
  return {
    id: String(r.id) as UUID,
    name: String(r.name),
    phone: (r.phone as string) ?? null,
    whatsapp: (r.whatsapp as string) ?? null,
    email: (r.email as string) ?? null,
    address: (r.address as string) ?? null,
    notes: (r.notes as string) ?? null,
    outstandingBalance: Number(r.outstanding_balance || 0),
    totalSpending: Number(r.total_spending || 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: (r.deleted_at as string) ?? null,
    branchId: (r.branch_id as UUID) ?? null,
  };
}

function mapProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id) as UUID,
    name: String(r.name),
    sku: (r.sku as string) ?? null,
    barcode: (r.barcode as string) ?? null,
    categoryId: (r.category_id as UUID) ?? null,
    unit: String(r.unit || "pcs"),
    costPrice: Number(r.cost_price || 0),
    sellingPrice: Number(r.selling_price || 0),
    stockQuantity: Number(r.stock_quantity || 0),
    minimumStock: Number(r.minimum_stock || 0),
    isActive: Number(r.is_active) !== 0,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: (r.deleted_at as string) ?? null,
    branchId: (r.branch_id as UUID) ?? null,
    version: Number(r.version || 1),
  } as Product;
}

export function createSqliteUnitOfWork(sqlite: SqliteDatabase): UnitOfWork {
  const { query, exec, transaction } = sqlite;

  const customers: CustomerRepository = {
    async list(q) {
      let sql = "SELECT * FROM customers WHERE deleted_at IS NULL";
      const params: unknown[] = [];
      if (q?.trim()) {
        sql += " AND (name LIKE ? OR phone LIKE ?)";
        params.push(`%${q}%`, `%${q}%`);
      }
      sql += " ORDER BY created_at DESC";
      return query(sql, params).map(mapCustomer);
    },
    async get(id) {
      const rows = query("SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL", [id]);
      return rows[0] ? mapCustomer(rows[0]) : null;
    },
    async create(data) {
      const id = generateId();
      const now = nowISO();
      transaction(() => {
        exec(
          `INSERT INTO customers (id,name,phone,email,address,notes,outstanding_balance,total_spending,created_at,updated_at,version)
           VALUES (?,?,?,?,?,?,0,0,?,?,1)`,
          [id, data.name, data.phone ?? null, data.email ?? null, data.address ?? null, data.notes ?? null, now, now]
        );
      });
      return (await this.get(id))!;
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: nowISO() };
      transaction(() => {
        exec(
          `UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, outstanding_balance=?, total_spending=?, updated_at=?, version=version+1 WHERE id=?`,
          [next.name, next.phone, next.email, next.address, next.notes, next.outstandingBalance, next.totalSpending, next.updatedAt, id]
        );
      });
      return this.get(id);
    },
  };

  const products: ProductRepository = {
    async list(opts) {
      let sql = "SELECT * FROM products WHERE deleted_at IS NULL";
      const params: unknown[] = [];
      if (opts?.query?.trim()) {
        sql += " AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)";
        const q = `%${opts.query}%`;
        params.push(q, q, q);
      }
      sql += " ORDER BY name ASC";
      let list = query(sql, params).map(mapProduct);
      if (opts?.lowStockOnly) list = list.filter((p) => p.stockQuantity <= p.minimumStock);
      return list;
    },
    async get(id) {
      const rows = query("SELECT * FROM products WHERE id=? AND deleted_at IS NULL", [id]);
      return rows[0] ? mapProduct(rows[0]) : null;
    },
    async getByBarcode(code) {
      const rows = query("SELECT * FROM products WHERE barcode=? AND deleted_at IS NULL", [code]);
      return rows[0] ? mapProduct(rows[0]) : null;
    },
    async create(data) {
      const id = generateId();
      const now = nowISO();
      transaction(() => {
        exec(
          `INSERT INTO products (id,name,sku,barcode,unit,cost_price,selling_price,stock_quantity,minimum_stock,is_active,created_at,updated_at,version)
           VALUES (?,?,?,?,?,?,?,?,?,1,?,?,1)`,
          [id, data.name, data.sku ?? null, data.barcode ?? null, data.unit ?? "pcs", data.costPrice ?? 0, data.sellingPrice ?? 0, data.stockQuantity ?? 0, data.minimumStock ?? 0, now, now]
        );
      });
      return (await this.get(id))!;
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: nowISO() };
      transaction(() => {
        exec(
          `UPDATE products SET name=?, sku=?, barcode=?, unit=?, cost_price=?, selling_price=?, stock_quantity=?, minimum_stock=?, is_active=?, updated_at=?, version=version+1 WHERE id=?`,
          [next.name, next.sku, next.barcode, next.unit, next.costPrice, next.sellingPrice, next.stockQuantity, next.minimumStock, next.isActive ? 1 : 0, next.updatedAt, id]
        );
      });
      return this.get(id);
    },
  };

  const sales: SaleRepository = {
    async list() {
      const saleRows = query("SELECT * FROM sales WHERE deleted_at IS NULL ORDER BY sale_date DESC LIMIT 500");
      return saleRows.map((s) => {
        const items = query("SELECT * FROM sale_items WHERE sale_id=?", [s.id]).map(
          (i): SaleItem => ({
            id: String(i.id) as UUID,
            saleId: String(i.sale_id) as UUID,
            productId: String(i.product_id) as UUID,
            productName: String(i.product_name),
            sku: (i.sku as string) ?? null,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            costPrice: Number(i.cost_price || 0),
            discountPercent: Number(i.discount_percent || 0),
            taxRate: Number(i.tax_rate || 0),
            lineTotal: Number(i.line_total),
          })
        );
        return {
          id: String(s.id) as UUID,
          invoiceNumber: String(s.invoice_number),
          customerId: (s.customer_id as UUID) ?? null,
          customerName: (s.customer_name as string) ?? null,
          saleDate: String(s.sale_date),
          subtotal: Number(s.subtotal),
          discountAmount: Number(s.discount_amount),
          taxAmount: Number(s.tax_amount),
          total: Number(s.total),
          paidAmount: Number(s.paid_amount),
          balanceAmount: Number(s.balance_amount),
          status: s.status as Sale["status"],
          notes: (s.notes as string) ?? null,
          items,
          createdAt: String(s.created_at),
          updatedAt: String(s.updated_at),
          version: Number(s.version || 1),
        } as Sale;
      });
    },
    async get(id) {
      return (await this.list()).find((s) => s.id === id) ?? null;
    },
    async create(sale) {
      transaction(() => {
        exec(
          `INSERT INTO sales (id,invoice_number,customer_id,customer_name,sale_date,subtotal,discount_amount,tax_amount,total,paid_amount,balance_amount,status,notes,created_at,updated_at,version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [sale.id, sale.invoiceNumber, sale.customerId, sale.customerName, sale.saleDate, sale.subtotal, sale.discountAmount, sale.taxAmount, sale.total, sale.paidAmount, sale.balanceAmount, sale.status, sale.notes, sale.createdAt, sale.updatedAt, sale.version || 1]
        );
        for (const i of sale.items) {
          exec(
            `INSERT INTO sale_items (id,sale_id,product_id,product_name,sku,quantity,unit_price,cost_price,discount_percent,tax_rate,line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [i.id, sale.id, i.productId, i.productName, i.sku, i.quantity, i.unitPrice, i.costPrice, i.discountPercent, i.taxRate, i.lineTotal]
          );
          const prod = query("SELECT stock_quantity FROM products WHERE id=?", [i.productId]);
          if (prod[0]) {
            const next = Number(prod[0].stock_quantity) - i.quantity;
            exec("UPDATE products SET stock_quantity=?, updated_at=? WHERE id=?", [next, nowISO(), i.productId]);
            exec(
              `INSERT INTO inventory_transactions (id,product_id,movement_type,quantity,balance_after,reference_type,reference_id,created_at) VALUES (?,?,?,?,?,?,?,?)`,
              [generateId(), i.productId, "sale", i.quantity, next, "sale", sale.id, nowISO()]
            );
          }
        }
        if (sale.customerId) {
          if (sale.balanceAmount > 0) {
            exec(`UPDATE customers SET outstanding_balance = outstanding_balance + ?, total_spending = total_spending + ?, updated_at=? WHERE id=?`, [sale.balanceAmount, sale.paidAmount, nowISO(), sale.customerId]);
          } else if (sale.paidAmount > 0) {
            exec(`UPDATE customers SET total_spending = total_spending + ?, updated_at=? WHERE id=?`, [sale.paidAmount, nowISO(), sale.customerId]);
          }
        }
        if (sale.paidAmount > 0) {
          exec(
            `INSERT INTO payments (id,amount,method,reference_type,reference_id,customer_id,paid_at,created_at,version) VALUES (?,?,?,?,?,?,?,?,1)`,
            [generateId(), sale.paidAmount, "cash", "sale", sale.id, sale.customerId, nowISO(), nowISO()]
          );
        }
      });
      return sale;
    },
  };

  const orders: OrderRepository = {
    async list() {
      return query("SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY order_date DESC LIMIT 500").map(
        (r) =>
          ({
            id: String(r.id),
            orderNumber: String(r.order_number),
            customerId: String(r.customer_id),
            customerName: (r.customer_name as string) ?? null,
            orderDate: String(r.order_date),
            deliveryDate: (r.delivery_date as string) ?? null,
            serviceType: r.service_type,
            status: r.status,
            price: Number(r.price),
            discount: Number(r.discount),
            advance: Number(r.advance),
            balance: Number(r.balance),
            externalMaterialCost: Number(r.external_material_cost || 0),
            orderExpensesTotal: Number(r.order_expenses_total || 0),
            quantity: Number(r.quantity || 1),
            unitPrice: Number(r.unit_price || 0),
            bulkDiscount: Number(r.bulk_discount || 0),
            customerSuppliedMaterial: false,
            shopSuppliedMaterial: true,
            notes: (r.notes as string) ?? null,
            expenses: [],
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
            version: Number(r.version || 1),
          }) as unknown as ServiceOrder
      );
    },
    async get(id) {
      return (await this.list()).find((o) => o.id === id) ?? null;
    },
    async create(order) {
      transaction(() => {
        exec(
          `INSERT INTO orders (id,order_number,customer_id,customer_name,order_date,delivery_date,service_type,status,price,discount,advance,balance,external_material_cost,order_expenses_total,quantity,notes,created_at,updated_at,version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [order.id, order.orderNumber, order.customerId, order.customerName, order.orderDate, order.deliveryDate, order.serviceType, order.status, order.price, order.discount, order.advance, order.balance, order.externalMaterialCost, order.orderExpensesTotal, order.quantity, order.notes, order.createdAt, order.updatedAt, order.version || 1]
        );
      });
      return order;
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: nowISO() };
      transaction(() => {
        exec(
          `UPDATE orders SET status=?, price=?, discount=?, advance=?, balance=?, external_material_cost=?, order_expenses_total=?, notes=?, delivery_date=?, updated_at=?, version=version+1 WHERE id=?`,
          [next.status, next.price, next.discount, next.advance, next.balance, next.externalMaterialCost, next.orderExpensesTotal, next.notes, next.deliveryDate, next.updatedAt, id]
        );
      });
      return this.get(id);
    },
  };

  return { customers, products, sales, orders, edition: "offline" };
}

export function backupSqliteFile(dbPath: string, backupPath: string, io: SqliteFileIO = nodeFileIO()): boolean {
  const data = io.readFile(dbPath);
  if (!data) return false;
  io.writeFile(backupPath, new Uint8Array(data));
  return true;
}

export function restoreSqliteFile(backupPath: string, dbPath: string, io: SqliteFileIO = nodeFileIO()): boolean {
  const data = io.readFile(backupPath);
  if (!data) return false;
  io.writeFile(dbPath, new Uint8Array(data));
  return true;
}
