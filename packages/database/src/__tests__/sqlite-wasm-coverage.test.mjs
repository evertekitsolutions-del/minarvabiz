import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { openSqliteDatabase } = require("../adapters/sqlite-browser.ts");
const wasmBinary = fs.readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));

function createStore() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-sqlite-wasm-cov-"));
  const filename = path.join(home, "minarvabiz.db");
  const io = {
    readFile: (file) => fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null,
    writeFile: (file, data) => fs.writeFileSync(file, Buffer.from(data)),
    exists: (file) => fs.existsSync(file),
    mkdirp: (folder) => { if (folder) fs.mkdirSync(folder, { recursive: true }); },
  };
  return { home, filename, io };
}

test("desktop WASM loader retains old ASM customer products and safely saves snapshot", async () => {
  const { home, filename, io } = createStore();
  try {
    // Legacy ASM backend writes an ordinary SQLite image.
    const old = await openSqliteDatabase(filename, io);
    old.exec("CREATE TABLE IF NOT EXISTS domain_kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const products = Array.from({ length: 80 }, (_, id) => ({ id: "P-" + id, name: "Dress " + id }));
    old.transaction(() => {
      old.exec("INSERT OR REPLACE INTO domain_kv(key, value) VALUES (?, ?)",
        ["domain_snapshot_v2", JSON.stringify({ products })]);
    });
    old.close();
    assert.ok(fs.statSync(filename).size > 0);
    // Reset the module singleton to load the WebAssembly engine as packaged
    // by the desktop runtime: same file, no migration, no network fetch.
    delete require.cache[require.resolve("../adapters/sqlite-browser.ts")];
    const next = require("../adapters/sqlite-browser.ts");
    const db = await next.openSqliteDatabase(filename, io, wasmBinary);
    assert.equal(JSON.parse(String(db.query("SELECT value FROM domain_kv WHERE key = ?",
      ["domain_snapshot_v2"])[0].value)).products.length, 80);
    for (let round = 0; round < 3; round += 1) {
      db.transaction(() => {
        db.exec("UPDATE domain_kv SET value=? WHERE key=?",
          [JSON.stringify({ products }), "domain_snapshot_v2"]);
      });
    }
    db.close();
    const reopened = await next.openSqliteDatabase(filename, io, wasmBinary);
    assert.equal(JSON.parse(String(reopened.query("SELECT value FROM domain_kv")[0].value)).products.length, 80);
    reopened.close();
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
