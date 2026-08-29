/**
 * Real SQLite file persistence test (sql.js engine).
 * node packages/database/src/__tests__/sqlite-persist.test.mjs
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-sqlite-"));
const dbPath = path.join(dir, "test.db");

let failed = 0;
function assert(c, m) {
  if (!c) {
    console.error("FAIL", m);
    failed++;
  } else console.log("OK", m);
}

const SQL = await initSqlJs();

function open(file) {
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const db = buf ? new SQL.Database(buf) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, outstanding_balance REAL DEFAULT 0,
    created_at TEXT, updated_at TEXT, deleted_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, stock_quantity REAL DEFAULT 0,
    cost_price REAL DEFAULT 0, selling_price REAL DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY, invoice_number TEXT UNIQUE, total REAL, paid_amount REAL, balance_amount REAL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY, sale_id TEXT, product_id TEXT, quantity REAL, line_total REAL
  )`);
  return db;
}

function save(db, file) {
  fs.writeFileSync(file, Buffer.from(db.export()));
}

{
  const db = open(dbPath);
  db.run("BEGIN");
  db.run("INSERT INTO customers VALUES (?,?,?,?,?,?)", [
    "c1", "Test Customer", 0, new Date().toISOString(), new Date().toISOString(), null,
  ]);
  db.run("INSERT INTO products VALUES (?,?,?,?,?)", ["p1", "Silk Thread", 10, 80, 120]);
  db.run("INSERT INTO sales VALUES (?,?,?,?,?)", ["s1", "INV-001", 240, 240, 0]);
  db.run("INSERT INTO sale_items VALUES (?,?,?,?,?)", ["si1", "s1", "p1", 2, 240]);
  db.run("UPDATE products SET stock_quantity = stock_quantity - 2 WHERE id = ?", ["p1"]);
  db.run("COMMIT");
  save(db, dbPath);
  db.close();
}

{
  const db = open(dbPath);
  const cust = db.exec("SELECT name FROM customers WHERE id='c1'");
  assert(cust[0]?.values[0][0] === "Test Customer", "customer persists after reopen");
  const stock = db.exec("SELECT stock_quantity FROM products WHERE id='p1'");
  assert(Number(stock[0]?.values[0][0]) === 8, "stock deducted and persisted");
  const sale = db.exec("SELECT invoice_number, total FROM sales WHERE id='s1'");
  assert(sale[0]?.values[0][0] === "INV-001", "sale invoice persists");
  assert(Number(sale[0]?.values[0][1]) === 240, "sale total persists");
  let uniqueOk = false;
  try {
    db.run("INSERT INTO sales VALUES (?,?,?,?,?)", ["s2", "INV-001", 1, 1, 0]);
  } catch {
    uniqueOk = true;
  }
  assert(uniqueOk, "duplicate invoice rejected");
  db.close();
}

fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("sqlite persist tests passed");
