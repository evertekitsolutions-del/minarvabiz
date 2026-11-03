import assert from "node:assert/strict";
import { test } from "node:test";
import { openSqliteDatabase } from "../sqlite-browser.ts";

test("SQLite binary survives close, fresh adapter reopen and domain snapshot restore", async () => {
  let diskImage = null;
  const io = {
    readFile: () => diskImage && new Uint8Array(diskImage),
    writeFile: (_path, bytes) => { diskImage = new Uint8Array(bytes); },
    exists: () => diskImage !== null,
    mkdirp: () => {},
  };

  const first = await openSqliteDatabase("minarvabiz.db", io);
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
  assert.ok(diskImage instanceof Uint8Array);
  assert.ok(diskImage.byteLength > 0);
  const committedImage = new Uint8Array(diskImage);
  first.close();

  // A new adapter instance reads only the committed binary image, like a new app process.
  diskImage = committedImage;
  const restarted = await openSqliteDatabase("minarvabiz.db", io);
  assert.deepEqual(restarted.query("PRAGMA quick_check").map((row) => Object.values(row)[0]), ["ok"]);
  const rows = restarted.query("SELECT value FROM domain_kv WHERE key = ?", ["domain_snapshot_v2"]);
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(String(rows[0].value)), expected);
  restarted.close();
});
