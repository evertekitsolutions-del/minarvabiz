import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(
  fs.readFileSync(filename,"utf8"), {
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }
).outputText,filename);

const { SyncEngine, createMemoryLocalStore } = require("../engine.ts");
const T0 = "2026-10-12T10:00:00.000Z";
const T1 = "2026-10-12T10:01:00.000Z";

function fixture({ table="customers", localVersion=2, remoteVersion=3, localTime=T0, remoteTime=T1 } = {}) {
  const local = createMemoryLocalStore();
  const original = { id: "record-1", version: localVersion, updatedAt: localTime, name: "Offline accepted", total: 125 };
  const remote = { id: "record-1", version: remoteVersion, updatedAt: remoteTime, name: "Cloud older work", total: 150 };
  const second = { id: "record-2", version: 3, updatedAt: T1, name: "Cloud-only customer" };
  const adapter = {
    rejectPush: true,
    pushes: 0,
    async push(events) {
      this.pushes++;
      if (this.rejectPush) return { accepted:[], rejected: events.map(e=>({ id:e.id, error:"cloud unavailable for this write" })) };
      return { accepted:events.map(e=>e.id), rejected:[] };
    },
    async pull() {
      return { records:[{tableName:table, record:{...remote}},{tableName:"customers",record:{...second}}], serverTime:T1 };
    },
  };
  const engine = new SyncEngine("device-a", adapter, local);
  engine.writeLocal(table, { ...original }, "update");
  return { engine, local, adapter, original, remote, second, table };
}

test("a refused upload must never be overwritten by a newer cloud pull (customers)", async () => {
  const { engine,local,original,adapter } = fixture();
  const session = await engine.sync();
  assert.equal(adapter.pushes, 1);
  assert.equal(local.get("customers",original.id).name,original.name,
    "offline data must remain available for owner conflict review");
  assert.equal(session.conflicts,1);
  assert.equal(engine.listConflicts().length,1);
  assert.equal(engine.listConflicts()[0].strategy,"manual");
  assert.equal(engine.outbox.stats().conflict,1);
  assert.equal(local.get("customers","record-2").name,"Cloud-only customer",
    "unrelated cloud records may still hydrate");

  // Repeated pulls of the same unresolved remote revision must not create
  // duplicate review records or silently replace the still-pending local edit.
  const repeat = await engine.sync();
  assert.equal(repeat.conflicts,0);
  assert.equal(engine.listConflicts().length,1);
  assert.equal(local.get("customers",original.id).name,original.name);
  assert.equal(engine.outbox.stats().conflict,1);

  const reviewed = engine.resolveConflictManually(engine.listConflicts()[0].id,"local");
  assert.equal(reviewed?.resolution,"local");
  assert.equal(local.get("customers",original.id).version,4,
    "reviewed local revision must advance past cloud revision");
  assert.equal(engine.outbox.stats().pending,1,"reviewed local changes must be retried");
  adapter.rejectPush=false;
  const retry=await engine.sync();
  assert.equal(retry.pushed,1);
  assert.equal(engine.outbox.stats().synced,1);
  assert.equal(local.get("customers",original.id).name,original.name);
});

test("same version divergent cloud payload cannot replace unacknowledged local edits", async () => {
  const { engine,local,original } = fixture({remoteVersion:2});
  const result=await engine.sync();
  assert.equal(result.conflicts,1);
  assert.equal(local.get("customers",original.id).name,original.name);
  assert.equal(engine.listConflicts()[0].strategy,"manual");
});

test("financial local sale with a failed push is protected from remote settlement overwrite", async () => {
  const { engine,local,original } = fixture({table:"sales"});
  const result=await engine.sync();
  assert.equal(local.get("sales",original.id).total,125);
  assert.equal(result.conflicts,1);
  assert.equal(engine.outbox.stats().conflict,1);
});

test("already acknowledged records still accept newer cloud changes", async () => {
  const { engine,local,original,remote,adapter } = fixture();
  adapter.rejectPush=false;
  const result=await engine.sync();
  assert.equal(result.errors,0);
  assert.equal(result.pushed,1);
  assert.equal(local.get("customers",original.id).name,remote.name,
    "no pending change means cloud is eligible to update local store");
  assert.equal(engine.listConflicts().length,0);
});
