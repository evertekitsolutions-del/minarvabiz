import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);

const outbox = require("../outbox-bridge.ts");
const cloud = require("../remote-write.ts");
const OWNER = "org-verified:user-verified";

function reset() {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(OWNER);
}

function latch() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

test("scoped replay never acknowledges a replacement restored under the same event ID", async () => {
  reset();
  await cloud.remoteUpsertCategory({ id: "category-a", name: "Before" });
  const original = outbox.exportOutbox()[0];
  const blocked = latch();
  let calls = 0;
  cloud.registerRemoteWriter({ upsertCategory: async () => { calls++; await blocked.promise; } }, OWNER);
  const pending = cloud.retryScopedMasterOutbox();
  const restored = structuredClone(outbox.exportOutbox());
  restored[0].payload.name = "After restore";
  assert.notEqual(restored[0], original);
  outbox.hydrateOutbox(restored);
  blocked.release();
  const result = await pending;
  assert.equal(result.acknowledged, 0);
  assert.equal(restored[0].status, "pending");
  assert.equal(restored[0].payload.name, "After restore");
  assert.equal(calls, 1);
  const retried = await cloud.retryScopedMasterOutbox();
  assert.equal(retried.acknowledged, 1, "only a new run may acknowledge the restored revision");
  assert.equal(outbox.exportOutbox()[0].status, "synced");
  assert.equal(calls, 2);
});

test("scoped replay holds an in-place payload edit after a cloud response", async () => {
  reset();
  await cloud.remoteUpsertCategory({ id: "category-edit", name: "Original" });
  const pendingRecord = outbox.exportOutbox()[0];
  const blocked = latch();
  cloud.registerRemoteWriter({ upsertCategory: async () => blocked.promise }, OWNER);
  const first = cloud.retryScopedMasterOutbox();
  pendingRecord.payload.name = "Edited while uploading";
  blocked.release();
  assert.equal((await first).acknowledged, 0);
  assert.equal(pendingRecord.status, "pending");
});

test("failed replay must not mark a different restored same-ID record failed", async () => {
  reset();
  await cloud.remoteUpsertCategory({ id: "category-error", name: "Original" });
  const blocked = latch();
  cloud.registerRemoteWriter({
    upsertCategory: async () => { await blocked.promise; throw Error("offline"); },
  }, OWNER);
  const first = cloud.retryScopedMasterOutbox();
  const restored = structuredClone(outbox.exportOutbox());
  restored[0].payload.name = "Recovered";
  outbox.hydrateOutbox(restored);
  blocked.release();
  const result = await first;
  assert.equal(result.failed, 0);
  assert.equal(restored[0].status, "pending");
  assert.equal(restored[0].attempts, 0);
  assert.equal(restored[0].lastError, null);
});

test("direct cloud success cannot acknowledge a restored event with a reused ID", async () => {
  reset();
  const blocked = latch();
  cloud.registerRemoteWriter({ upsertCategory: async () => blocked.promise }, OWNER);
  const first = cloud.remoteUpsertCategory({ id: "category-direct", name: "Original" });
  const restored = structuredClone(outbox.exportOutbox());
  restored[0].payload.name = "Revised after restore";
  outbox.hydrateOutbox(restored);
  blocked.release();
  await first;
  assert.equal(restored[0].status, "pending");
});

test("direct sale with multiple payments keeps entire group pending if one restored payload changes", async () => {
  reset();
  const blocked = latch();
  cloud.registerRemoteWriter({ createSale: async () => blocked.promise }, OWNER);
  const first = cloud.remoteCreateSale({ id: "sale-42", total: 125 }, [
    { id: "cash-42", amount: 100 }, { id: "card-42", amount: 25 },
  ]);
  const restored = structuredClone(outbox.exportOutbox());
  restored[2].payload.amount = 20;
  outbox.hydrateOutbox(restored);
  blocked.release();
  await first;
  assert.deepEqual(outbox.exportOutbox().map(e => e.status), ["pending", "pending", "pending"]);
});

test("unchanged same-owner replay still acknowledges successfully", async () => {
  reset();
  await cloud.remoteUpsertCategory({ id: "category-stable", name: "Stable" });
  cloud.registerRemoteWriter({ upsertCategory: async () => {} }, OWNER);
  const result = await cloud.retryScopedMasterOutbox();
  assert.equal(result.acknowledged, 1);
  assert.equal(outbox.exportOutbox()[0].status, "synced");
});
