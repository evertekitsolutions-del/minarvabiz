import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-bak-"));
const dbPath = path.join(dir, "main.db");
const bakPath = path.join(dir, "backup.db");

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
  db.run("CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT)");
  return db;
}
function save(db, file) {
  fs.writeFileSync(file, Buffer.from(db.export()));
}

{
  const db = open(dbPath);
  db.run("INSERT INTO customers VALUES (?,?)", ["c1", "Backup Test"]);
  save(db, dbPath);
  db.close();
}
// backup
fs.copyFileSync(dbPath, bakPath);
// corrupt main
{
  const db = open(dbPath);
  db.run("DELETE FROM customers");
  save(db, dbPath);
  db.close();
}
{
  const db = open(dbPath);
  const empty = db.exec("SELECT count(*) FROM customers");
  assert(Number(empty[0].values[0][0]) === 0, "main emptied");
  db.close();
}
// restore
fs.copyFileSync(bakPath, dbPath);
{
  const db = open(dbPath);
  const rows = db.exec("SELECT name FROM customers WHERE id='c1'");
  assert(rows[0]?.values[0][0] === "Backup Test", "restore recovers data");
  db.close();
}

fs.rmSync(dir, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("sqlite backup tests passed");
