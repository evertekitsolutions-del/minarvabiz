import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText, filename);

const { SyncEngine, createMemoryLocalStore } = require("../engine.ts");
const { isFinancialTable } = require("../constants.ts");

const DEVICE = "d1000000-0000-0000-0000-000000000001";
const SALE = "s1000000-0000-0000-0000-000000000001";
const CUSTOMER = "c1000000-0000-0000-0000-000000000001";
const T0 = "2026-09-27T00:00:00.000Z";
const T1 = "2026-09-27T00:01:00.000Z";

for (const table of [
  "sales", "payments", "sale_returns", "purchase_returns", "purchase_invoices",
  "journal_entries", "inventory_transactions", "warehouse_stock", "warehouse_transfers",
]) {
  assert.equal(isFinancialTable(table), true, `${table} must require manual conflict review`);
}

{
  const local = createMemoryLocalStore();
  const remoteSale = { id: SALE, version: 2, updatedAt: T1, total: 250 };
  let accept = false;
  const adapter = {
    async push(events) {
      if (accept) return { accepted: events.map((e) => e.id), rejected: [] };
      return {
        accepted: [],
        rejected: events.map((e) => ({ id: e.id, error: "version_conflict", remote: remoteSale })),
      };
    },
    async pull() { return { records: [], serverTime: T1 }; },
  };
  const engine = new SyncEngine(DEVICE, adapter, local);
  engine.writeLocal("sales", { id: SALE, version: 1, updatedAt: T0, total: 200 }, "update");

  const first = await engine.sync();
  assert.equal(first.conflicts, 1);
  assert.equal(engine.listConflicts().length, 1);
  assert.equal(engine.outbox.stats().conflict, 1);
  assert.equal(local.get("sales", SALE).total, 200, "financial conflict must not silently overwrite local data");

  const conflict = engine.listConflicts()[0];
  const resolved = engine.resolveConflictManually(conflict.id, "local");
  assert.equal(resolved.resolution, "local");
  assert.equal(local.get("sales", SALE).version, 3, "local winner must advance above both versions");
  assert.equal(engine.outbox.stats().pending, 1, "local winner must be requeued for cloud reconciliation");
  assert.equal(engine.outbox.stats().conflict, 0);

  accept = true;
  const second = await engine.sync();
  assert.equal(second.status, "completed");
  assert.equal(second.pushed, 1);
  assert.equal(engine.outbox.stats().pending, 0);
  assert.equal(engine.outbox.stats().synced, 1);
}

{
  const local = createMemoryLocalStore();
  const remoteSale = { id: SALE, version: 4, updatedAt: T1, total: 400 };
  const adapter = {
    async push(events) {
      return {
        accepted: [],
        rejected: events.map((e) => ({ id: e.id, error: "version_conflict", remote: remoteSale })),
      };
    },
    async pull() { return { records: [], serverTime: T1 }; },
  };
  const engine = new SyncEngine(DEVICE, adapter, local);
  engine.writeLocal("sales", { id: SALE, version: 3, updatedAt: T0, total: 300 }, "update");
  await engine.sync();
  const conflict = engine.listConflicts()[0];
  engine.resolveConflictManually(conflict.id, "remote");
  assert.equal(local.get("sales", SALE).total, 400);
  assert.equal(engine.outbox.stats().pending, 0);
  assert.equal(engine.outbox.stats().conflict, 0);
  assert.throws(
    () => engine.resolveConflictManually(conflict.id, "merged", { total: 350 }),
    /cannot be field-merged/i,
  );
}

{
  const local = createMemoryLocalStore();
  local.upsert("customers", { id: CUSTOMER, version: 1, updatedAt: T0, name: "Local A" });
  const adapter = {
    async push() { return { accepted: [], rejected: [] }; },
    async pull() {
      return {
        records: [{ tableName: "customers", record: { id: CUSTOMER, version: 1, updatedAt: T0, name: "Remote B" } }],
        serverTime: T1,
      };
    },
  };
  const engine = new SyncEngine(DEVICE, adapter, local);
  const session = await engine.sync();
  assert.equal(session.conflicts, 1, "same-version divergent payload must surface a conflict");
  assert.equal(engine.listConflicts()[0].strategy, "manual");
  assert.equal(local.get("customers", CUSTOMER).name, "Local A");
}

{
  const local = createMemoryLocalStore();
  const remoteCustomer = { id: CUSTOMER, version: 2, updatedAt: T1, name: "Remote newer" };
  const adapter = {
    async push(events) {
      return {
        accepted: [],
        rejected: events.map((e) => ({ id: e.id, error: "version_conflict", remote: remoteCustomer })),
      };
    },
    async pull() { return { records: [], serverTime: T1 }; },
  };
  const engine = new SyncEngine(DEVICE, adapter, local);
  engine.writeLocal("customers", { id: CUSTOMER, version: 1, updatedAt: T0, name: "Local older" }, "update");
  const session = await engine.sync();
  assert.equal(session.conflicts, 0, "non-financial newer remote can auto-resolve");
  assert.equal(local.get("customers", CUSTOMER).name, "Remote newer");
  assert.equal(engine.outbox.stats().pending, 0);
}

console.log("Hybrid sync conflict safety PASS");
