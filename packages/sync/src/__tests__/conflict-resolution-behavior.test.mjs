import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const { SyncEngine, createMemoryLocalStore } = require("../engine.ts");

class ScriptedAdapter {
  constructor({ pullRecords = [], rejectPush = null } = {}) {
    this.pullRecords = pullRecords;
    this.rejectPush = rejectPush;
    this.pushed = [];
  }
  async push(events) {
    this.pushed.push(...events.map((e) => ({ ...e, payload: { ...e.payload } })));
    if (this.rejectPush) {
      return {
        accepted: [],
        rejected: events.map((e) => ({
          id: e.id,
          error: "version_conflict",
          remote: { ...this.rejectPush },
        })),
      };
    }
    return { accepted: events.map((e) => e.id), rejected: [] };
  }
  async pull() {
    const records = this.pullRecords;
    this.pullRecords = [];
    return { records, serverTime: "2026-09-27T06:00:00.000Z" };
  }
}

{
  const local = createMemoryLocalStore();
  local.upsert("customers", {
    id: "customer-1",
    version: 2,
    updatedAt: "2026-09-27T05:00:00.000Z",
    name: "Local name",
  });
  const adapter = new ScriptedAdapter({
    pullRecords: [{
      tableName: "customers",
      record: {
        id: "customer-1",
        version: 2,
        updatedAt: "2026-09-27T05:01:00.000Z",
        name: "Remote name",
      },
    }],
  });
  const engine = new SyncEngine("device-1", adapter, local);
  const session = await engine.sync();
  assert.equal(session.status, "completed");
  assert.equal(session.pulled, 1);
  assert.equal(session.conflicts, 0);
  assert.equal(local.get("customers", "customer-1").name, "Remote name");
  const history = engine.listConflicts(false);
  assert.equal(history.length, 1);
  assert.equal(history[0].resolution, "remote");
}

{
  const local = createMemoryLocalStore();
  local.upsert("sales", {
    id: "sale-1",
    version: 4,
    updatedAt: "2026-09-27T05:00:00.000Z",
    total: 100,
  });
  const adapter = new ScriptedAdapter({
    pullRecords: [{
      tableName: "sales",
      record: {
        id: "sale-1",
        version: 4,
        updatedAt: "2026-09-27T05:02:00.000Z",
        total: 125,
      },
    }],
  });
  const engine = new SyncEngine("device-2", adapter, local);
  const session = await engine.sync();
  assert.equal(session.status, "completed");
  assert.equal(session.conflicts, 1);
  assert.equal(local.get("sales", "sale-1").total, 100, "financial conflict must not auto-overwrite local state");
  const conflict = engine.listConflicts()[0];
  assert.ok(conflict);
  assert.equal(conflict.strategy, "manual");

  const resolved = engine.resolveConflictManually(conflict.id, "remote");
  assert.equal(resolved?.resolution, "remote");
  assert.equal(local.get("sales", "sale-1").total, 125);
  assert.equal(engine.listConflicts().length, 0);
}

{
  const local = createMemoryLocalStore();
  const adapter = new ScriptedAdapter({
    rejectPush: {
      id: "sale-2",
      version: 7,
      updatedAt: "2026-09-27T05:10:00.000Z",
      total: 200,
    },
  });
  const engine = new SyncEngine("device-3", adapter, local);
  engine.writeLocal("sales", {
    id: "sale-2",
    version: 6,
    updatedAt: "2026-09-27T05:09:00.000Z",
    total: 175,
  }, "update");

  const first = await engine.sync();
  assert.equal(first.conflicts, 1);
  assert.equal(engine.outbox.stats().conflict, 1);

  const conflict = engine.listConflicts()[0];
  const resolved = engine.resolveConflictManually(conflict.id, "local");
  assert.equal(resolved?.resolution, "local");
  const localResolved = local.get("sales", "sale-2");
  assert.equal(localResolved.version, 8, "local winner must advance beyond both conflicting revisions");
  assert.equal(localResolved.total, 175);
  assert.equal(engine.outbox.stats().pending, 1, "local winner must be requeued for cloud push");
  assert.equal(engine.outbox.stats().conflict, 0);

  adapter.rejectPush = null;
  const second = await engine.sync();
  assert.equal(second.status, "completed");
  assert.equal(second.pushed, 1);
  assert.equal(engine.outbox.stats().synced, 1);
  assert.equal(adapter.pushed.at(-1).payload.version, 8);
}

console.log("Sync conflict detection and durable resolution PASS");
