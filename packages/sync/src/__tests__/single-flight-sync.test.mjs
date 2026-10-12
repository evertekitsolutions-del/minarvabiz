import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  file,
);

const { SyncEngine, createMemoryLocalStore } = require("../engine.ts");

function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

function makeAdapter() {
  const firstPush = deferred();
  return {
    firstPush,
    pushCalls: 0,
    pullCalls: 0,
    received: [],
    failFirst: false,
    async push(events) {
      this.pushCalls++;
      this.received.push(events.map(event => event.id));
      if (this.pushCalls === 1) await firstPush.promise;
      if (this.failFirst) {
        this.failFirst = false;
        throw Error("temporary cloud transport failure");
      }
      return { accepted: events.map(event => event.id), rejected: [] };
    },
    async pull() {
      this.pullCalls++;
      return { records: [], serverTime: new Date().toISOString() };
    },
  };
}

function writeCustomer(engine, id) {
  engine.writeLocal("customers", {
    id,
    version: 1,
    updatedAt: new Date().toISOString(),
    name: id,
  }, "insert");
}

test("two concurrent sync triggers share one in-flight session and one remote push", async () => {
  const adapter = makeAdapter();
  const engine = new SyncEngine("device-1", adapter, createMemoryLocalStore());
  writeCustomer(engine, "customer-1");
  const first = engine.sync();
  const second = engine.sync();
  const samePromise = first === second;
  const beforeReleasePushCalls = adapter.pushCalls;
  adapter.firstPush.release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(samePromise, true, "overlapping callers must share one in-flight Promise");
  assert.equal(beforeReleasePushCalls, 1, "pending transaction must not be posted twice");
  assert.equal(adapter.pushCalls, 1);
  assert.equal(adapter.pullCalls, 1);
  assert.equal(a.id, b.id);
  assert.equal(a.status, "completed");
  assert.equal(engine.outbox.stats().synced, 1);
  assert.equal(engine.listSessions().length, 1);
});

test("writes added while push is underway remain queued for the next distinct sync", async () => {
  const adapter = makeAdapter();
  const engine = new SyncEngine("device-2", adapter, createMemoryLocalStore());
  writeCustomer(engine, "existing");
  const first = engine.sync();
  writeCustomer(engine, "new-during-upload");
  adapter.firstPush.release();
  const one = await first;
  assert.equal(one.pushed, 1);
  assert.equal(engine.outbox.stats().pending, 1);
  assert.equal(adapter.pushCalls, 1);
  const second = await engine.sync();
  assert.equal(second.status, "completed");
  assert.notEqual(second.id, one.id, "a finished sync must release the single-flight gate");
  assert.equal(adapter.pushCalls, 2);
  assert.equal(adapter.pullCalls, 2);
  assert.equal(engine.outbox.stats().synced, 2);
  assert.deepEqual(adapter.received.map(batch => batch.length), [1, 1]);
});

test("transport failure is shared by overlapping callers and a later retry works", async () => {
  const adapter = makeAdapter();
  adapter.failFirst = true;
  const engine = new SyncEngine("device-3", adapter, createMemoryLocalStore());
  writeCustomer(engine, "retry-me");
  const first = engine.sync();
  const second = engine.sync();
  adapter.firstPush.release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.id, b.id);
  assert.equal(a.status, "failed");
  assert.match(a.lastError, /temporary cloud transport failure/);
  assert.equal(adapter.pushCalls, 1);
  assert.equal(engine.outbox.stats().pending, 1, "unacknowledged event must survive a failed push");

  const retried = await engine.sync();
  assert.equal(retried.status, "completed");
  assert.equal(retried.pushed, 1);
  assert.equal(adapter.pushCalls, 2);
  assert.equal(engine.outbox.stats().synced, 1);
  assert.equal(engine.listSessions().length, 2);
});
