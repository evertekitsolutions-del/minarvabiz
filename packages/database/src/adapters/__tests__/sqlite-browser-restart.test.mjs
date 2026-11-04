import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { openSqliteDatabase } = require("../sqlite-browser.ts");

test("SQLite binary survives close, fresh adapter reopen and domain snapshot restore", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "minarvabiz-sqlite-restart-"));
  const dbPath = path.join(root, "minarvabiz.db");
  const io = {
    readFile: (file) => fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null,
    writeFile: (file, bytes) => fs.writeFileSync(file, bytes),
    exists: (file) => fs.existsSync(file),
    mkdirp: (dir) => { if (dir) fs.mkdirSync(dir, { recursive: true }); },
  };

  const first = await openSqliteDatabase(dbPath, io);
  first.exec("CREATE TABLE IF NOT EXISTS domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const expected = {
    version: 2,
    customer: { id: "customer-restart-1", name: "SQLite restart fixture", branchId: "branch-a" },
    payment: { id: "payment-restart-1", customerId: "customer-restart-1", amount: 1250, branchId: "branch-a" },
    journal: { id: "journal-restart-1", referenceType: "auto_collection", referenceId: "payment-restart-1", branchId: "branch-a", debit: 1250, credit: 1250 },
  };
  first.transaction(() => {
    first.exec("INSERT OR REPLACE INTO domain_kv (key, value, updated_at) VALUES (?, ?, ?)", [
      "domain_snapshot_v2", JSON.stringify(expected), "2026-11-03T00:00:00.000Z",
    ]);
  });
  first.close();
  assert.ok(fs.existsSync(dbPath));
  assert.ok(fs.statSync(dbPath).size > 0);

  // A new adapter instance reads the actual committed SQLite file, like a new app process.
  const restarted = await openSqliteDatabase(dbPath, io);
  assert.deepEqual(restarted.query("PRAGMA quick_check").map((row) => Object.values(row)[0]), ["ok"]);
  const rows = restarted.query("SELECT value FROM domain_kv WHERE key = ?", ["domain_snapshot_v2"]);
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(String(rows[0].value)), expected);
  restarted.close();
  fs.rmSync(root, { recursive: true, force: true });
});
