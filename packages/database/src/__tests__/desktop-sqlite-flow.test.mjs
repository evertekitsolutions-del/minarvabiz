/**
 * Proves: open SQLite → write domain snapshot (customer, product, sale) → close → reopen → data exists
 * node packages/database/src/__tests__/desktop-sqlite-flow.test.mjs
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-desktop-"));
const dbPath = path.join(dir, "minarvabiz.db");
let failed = 0;
function assert(c, m) {
  if (!c) {
    console.error("FAIL", m);
    failed++;
  } else console.log("OK", m);
}

const SQL = await initSqlJs();
const SNAPSHOT_KEY = "domain_snapshot_v2";

function open() {
  const buf = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  const db = buf ? new SQL.Database(buf) : new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS domain_kv (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT, phone TEXT, outstanding_balance REAL DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT, stock_quantity REAL DEFAULT 0, cost_price REAL, selling_price REAL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY, invoice_number TEXT UNIQUE, total REAL, paid_amount REAL
  )`);
  return db;
}
function save(db) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

// Session 1 — Electron startup simulation
{
  const db = open();
  const snap = {
    version: 2,
    customers: [{ id: "c1", name: "Asha", phone: "999", outstandingBalance: 0 }],
    products: [{ id: "p1", name: "Saree", stockQuantity: 5, costPrice: 500, sellingPrice: 899 }],
    sales: [{ id: "s1", invoiceNumber: "INV-1001", total: 899, paidAmount: 899 }],
    payments: [],
    orders: [],
    categories: [],
  };
  db.run("BEGIN");
  db.run("INSERT OR REPLACE INTO domain_kv VALUES (?,?,?)", [
    SNAPSHOT_KEY,
    JSON.stringify(snap),
    new Date().toISOString(),
  ]);
  db.run("INSERT OR REPLACE INTO customers VALUES (?,?,?,?)", ["c1", "Asha", "999", 0]);
  db.run("INSERT OR REPLACE INTO products VALUES (?,?,?,?,?)", ["p1", "Saree", 4, 500, 899]);
  db.run("INSERT OR REPLACE INTO sales VALUES (?,?,?,?)", ["s1", "INV-1001", 899, 899]);
  db.run("COMMIT");
  save(db);
  db.close();
  assert(fs.existsSync(dbPath), "SQLite file created at userData path equivalent");
}

// Session 2 — restart
{
  const db = open();
  const row = db.exec(`SELECT value FROM domain_kv WHERE key='${SNAPSHOT_KEY}'`);
  assert(!!row[0], "snapshot row exists after restart");
  const snap = JSON.parse(row[0].values[0][0]);
  assert(snap.customers[0].name === "Asha", "customer persists");
  assert(snap.products[0].name === "Saree", "product persists");
  assert(snap.sales[0].invoiceNumber === "INV-1001", "sale persists");
  const stock = db.exec("SELECT stock_quantity FROM products WHERE id='p1'");
  assert(Number(stock[0].values[0][0]) === 4, "inventory persists");
  db.close();
}

fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("desktop SQLite flow test passed");
