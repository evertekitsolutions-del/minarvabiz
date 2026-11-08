import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDesktop = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const wasmPath = requireDesktop.resolve("sql.js/dist/sql-wasm.wasm");
const asmPath = requireDesktop.resolve("sql.js/dist/sql-asm.js");
const initWasm = requireDesktop("sql.js/dist/sql-wasm.js");
const initAsm = requireDesktop("sql.js/dist/sql-asm.js");
const wasmBinary = fs.readFileSync(wasmPath);

assert.ok(fs.statSync(wasmPath).size > 100_000, "Packaged SQLite WASM runtime is unexpectedly empty");
assert.ok(fs.statSync(asmPath).size > 100_000, "Legacy snapshots must remain readable without backend migration");
const [wasm, asm] = await Promise.all([initWasm({ wasmBinary }), initAsm({})]);

// Both engines must use exactly the same portable SQLite image format.
const legacy = new asm.Database();
legacy.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT)");
const products = Array.from({ length: 80 }, (_, i) => ({
  id: "p-" + i,
  name: "Product " + i,
  barcode: "290" + String(i).padStart(9, "0"),
  stockQuantity: i + 1,
}));
const snapshot = JSON.stringify({ version: 2, products });
legacy.run("INSERT INTO domain_kv (key, value) VALUES (?, ?)", ["domain_snapshot_v2", snapshot]);
const bytes = legacy.export();
legacy.close();

const database = new wasm.Database(bytes);
assert.equal(
  JSON.parse(database.exec("SELECT value FROM domain_kv WHERE key='domain_snapshot_v2'")[0].values[0][0]).products.length,
  products.length,
  "Opening an old ASM.js SQLite image through WASM must retain every product",
);

// Repeated writes/export cycles exercise the exact OOM-prone production path.
for (let i = 0; i < 40; i += 1) {
  database.run("BEGIN");
  database.run("UPDATE domain_kv SET value = ? WHERE key='domain_snapshot_v2'", [snapshot]);
  database.run("COMMIT");
  const full = database.export();
  assert.ok(full.byteLength > 0, "WASM database export produced no binary");
}
const saved = database.export();
database.close();
const reopened = new wasm.Database(saved);
const actual = JSON.parse(reopened.exec("SELECT value FROM domain_kv WHERE key='domain_snapshot_v2'")[0].values[0][0]);
assert.deepEqual(actual.products.map((p) => p.id), products.map((p) => p.id));
reopened.close();

const source = fs.readFileSync(new URL("../apps/desktop/src/lib/sqlite-bootstrap.ts", import.meta.url), "utf8");
const ipc = fs.readFileSync(new URL("../apps/desktop/electron/main.ts", import.meta.url), "utf8");
const preload = fs.readFileSync(new URL("../apps/desktop/electron/preload.ts", import.meta.url), "utf8");
const renderer = fs.readFileSync(new URL("../packages/database/src/adapters/sqlite-browser.ts", import.meta.url), "utf8");
const builder = fs.readFileSync(new URL("../apps/desktop/electron-builder.yml", import.meta.url), "utf8");
assert.match(ipc, /requireTrustedRenderer\(event\)/);
assert.match(ipc, /db:sqliteWasmBinary/);
assert.match(preload, /readSqliteWasmBinary/);
assert.match(source, /openSqliteDatabase\(dbPath, io, wasmBinary\)/);
assert.match(renderer, /sql.js\/dist\/sql-wasm.js/);
assert.match(renderer, /wasmBinary/);
assert.match(builder, /node_modules\/sql.js/);
console.log("Desktop WASM SQLite compatibility, repeated snapshot exports and product preservation PASS");
