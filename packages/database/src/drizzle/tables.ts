/**
 * Portable table definitions matching Drizzle column shapes.
 * When packaging: `pnpm add drizzle-orm better-sqlite3` (desktop)
 * or `drizzle-orm postgres` (web) and map these to drizzle sqliteTable/pgTable.
 */

export type ColumnType = "text" | "integer" | "real" | "boolean" | "json" | "timestamptz";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  primaryKey?: boolean;
  notNull?: boolean;
  default?: string | number | boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes?: string[];
}

export const CORE_TABLES: TableDef[] = [
  {
    name: "customers",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text", notNull: true },
      { name: "phone", type: "text" },
      { name: "whatsapp", type: "text" },
      { name: "email", type: "text" },
      { name: "address", type: "text" },
      { name: "notes", type: "text" },
      { name: "outstanding_balance", type: "real", notNull: true, default: 0 },
      { name: "total_spending", type: "real", notNull: true, default: 0 },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "deleted_at", type: "text" },
      { name: "branch_id", type: "text" },
      { name: "version", type: "integer", notNull: true, default: 1 },
    ],
    indexes: ["phone"],
  },
  {
    name: "products",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text", notNull: true },
      { name: "sku", type: "text" },
      { name: "barcode", type: "text" },
      { name: "category_id", type: "text" },
      { name: "unit", type: "text", notNull: true, default: "pcs" },
      { name: "cost_price", type: "real", notNull: true, default: 0 },
      { name: "selling_price", type: "real", notNull: true, default: 0 },
      { name: "stock_quantity", type: "real", notNull: true, default: 0 },
      { name: "minimum_stock", type: "real", notNull: true, default: 0 },
      { name: "is_active", type: "integer", notNull: true, default: 1 },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "deleted_at", type: "text" },
      { name: "branch_id", type: "text" },
      { name: "version", type: "integer", notNull: true, default: 1 },
    ],
    indexes: ["barcode", "sku"],
  },
  {
    name: "sales",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "invoice_number", type: "text", notNull: true },
      { name: "customer_id", type: "text" },
      { name: "customer_name", type: "text" },
      { name: "sale_date", type: "text", notNull: true },
      { name: "subtotal", type: "real", notNull: true },
      { name: "discount", type: "real", notNull: true, default: 0 },
      { name: "tax", type: "real", notNull: true, default: 0 },
      { name: "total", type: "real", notNull: true },
      { name: "paid_amount", type: "real", notNull: true, default: 0 },
      { name: "balance_amount", type: "real", notNull: true, default: 0 },
      { name: "payment_method", type: "text" },
      { name: "status", type: "text", notNull: true },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "deleted_at", type: "text" },
      { name: "branch_id", type: "text" },
      { name: "version", type: "integer", notNull: true, default: 1 },
    ],
    indexes: ["sale_date", "invoice_number"],
  },
  {
    name: "orders",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "order_number", type: "text", notNull: true },
      { name: "customer_id", type: "text", notNull: true },
      { name: "customer_name", type: "text" },
      { name: "order_date", type: "text", notNull: true },
      { name: "delivery_date", type: "text" },
      { name: "service_type", type: "text", notNull: true },
      { name: "status", type: "text", notNull: true },
      { name: "price", type: "real", notNull: true },
      { name: "discount", type: "real", notNull: true, default: 0 },
      { name: "advance", type: "real", notNull: true, default: 0 },
      { name: "balance", type: "real", notNull: true, default: 0 },
      { name: "payload_json", type: "text" },
      { name: "created_at", type: "text", notNull: true },
      { name: "updated_at", type: "text", notNull: true },
      { name: "deleted_at", type: "text" },
      { name: "branch_id", type: "text" },
      { name: "version", type: "integer", notNull: true, default: 1 },
    ],
    indexes: ["status", "order_number"],
  },
];

/** Generate CREATE TABLE SQL from portable defs (SQLite dialect) */
export function tableDefToSqlite(table: TableDef): string {
  const cols = table.columns.map((c) => {
    let sql = `${c.name} ${c.type === "boolean" ? "INTEGER" : c.type.toUpperCase()}`;
    if (c.primaryKey) sql += " PRIMARY KEY";
    if (c.notNull && !c.primaryKey) sql += " NOT NULL";
    if (c.default !== undefined) {
      sql += ` DEFAULT ${typeof c.default === "string" ? `'${c.default}'` : c.default}`;
    }
    return sql;
  });
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${cols.join(",\n  ")}\n);`;
}
