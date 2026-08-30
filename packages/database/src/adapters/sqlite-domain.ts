/**
 * Persist full domain snapshot inside SQLite (primary offline store).
 * Normalized sales/customers also written for integrity queries.
 */

import type { SqliteDatabase } from "./sqlite";
import { generateId, nowISO } from "@minarvabiz/utils";

export interface DomainSnapshotLike {
  version: number;
  exportedAt: string;
  customers: unknown[];
  products: unknown[];
  categories: unknown[];
  sales: unknown[];
  payments: unknown[];
  orders: unknown[];
  measurements: unknown[];
  laundry: unknown[];
  expenses: unknown[];
  purchases: unknown[];
  suppliers: unknown[];
  expenseCategories: unknown[];
  staff: unknown[];
  assignments: unknown[];
  incentiveRules: unknown[];
  payouts: unknown[];
  notifications: unknown[];
  returns: unknown[];
  audit: unknown[];
  branches: unknown[];
  activeBranchId?: string | null;
  shopProfile?: unknown;
  outbox?: unknown[];
}

const SNAPSHOT_KEY = "domain_snapshot_v2";

export function ensureDomainTables(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS domain_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function saveDomainSnapshotToSqlite(
  sqlite: SqliteDatabase,
  snapshot: DomainSnapshotLike
): void {
  ensureDomainTables(sqlite);
  const json = JSON.stringify(snapshot);
  sqlite.transaction(() => {
    sqlite.exec(
      `INSERT OR REPLACE INTO domain_kv (key, value, updated_at) VALUES (?, ?, ?)`,
      [SNAPSHOT_KEY, json, nowISO()]
    );
    // Mirror customers/products/sales into normalized tables for integrity
    for (const c of snapshot.customers as Array<Record<string, unknown>>) {
      sqlite.exec(
        `INSERT OR REPLACE INTO customers (id, name, phone, email, address, notes, outstanding_balance, total_spending, created_at, updated_at, version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          c.id,
          c.name,
          c.phone ?? null,
          c.email ?? null,
          c.address ?? null,
          c.notes ?? null,
          c.outstandingBalance ?? 0,
          c.totalSpending ?? 0,
          c.createdAt ?? nowISO(),
          c.updatedAt ?? nowISO(),
          c.version ?? 1,
        ]
      );
    }
    for (const p of snapshot.products as Array<Record<string, unknown>>) {
      sqlite.exec(
        `INSERT OR REPLACE INTO products (id, name, sku, barcode, unit, cost_price, selling_price, stock_quantity, minimum_stock, is_active, created_at, updated_at, version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id,
          p.name,
          p.sku ?? null,
          p.barcode ?? null,
          p.unit ?? "pcs",
          p.costPrice ?? 0,
          p.sellingPrice ?? 0,
          p.stockQuantity ?? 0,
          p.minimumStock ?? 0,
          p.isActive === false ? 0 : 1,
          p.createdAt ?? nowISO(),
          p.updatedAt ?? nowISO(),
          p.version ?? 1,
        ]
      );
    }
    for (const s of snapshot.sales as Array<Record<string, unknown>>) {
      sqlite.exec(
        `INSERT OR REPLACE INTO sales (id, invoice_number, customer_id, customer_name, sale_date, subtotal, discount_amount, tax_amount, total, paid_amount, balance_amount, status, notes, created_at, updated_at, version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          s.id,
          s.invoiceNumber,
          s.customerId ?? null,
          s.customerName ?? null,
          s.saleDate,
          s.subtotal ?? 0,
          s.discountAmount ?? 0,
          s.taxAmount ?? 0,
          s.total ?? 0,
          s.paidAmount ?? 0,
          s.balanceAmount ?? 0,
          s.status ?? "completed",
          s.notes ?? null,
          s.createdAt ?? nowISO(),
          s.updatedAt ?? nowISO(),
          s.version ?? 1,
        ]
      );
    }
  });
}

export function loadDomainSnapshotFromSqlite(
  sqlite: SqliteDatabase
): DomainSnapshotLike | null {
  ensureDomainTables(sqlite);
  const rows = sqlite.query(`SELECT value FROM domain_kv WHERE key = ?`, [SNAPSHOT_KEY]);
  if (!rows[0]?.value) return null;
  try {
    return JSON.parse(String(rows[0].value)) as DomainSnapshotLike;
  } catch {
    return null;
  }
}
