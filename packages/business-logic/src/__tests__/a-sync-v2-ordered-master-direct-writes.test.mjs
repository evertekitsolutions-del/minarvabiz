import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, file,
);
const outbox = require("../outbox-bridge.ts");
const cloud = require("../remote-write.ts");
const OWNER = "verified-org:verified-user";

function reset() {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(OWNER);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const states = () => outbox.exportOutbox().map(e => e.status);

for (const [kind, method, writerMethod] of [
  ["category", "remoteUpsertCategory", "upsertCategory"],
  ["customer", "remoteUpsertCustomer", "upsertCustomer"],
  ["product", "remoteUpsertProduct", "upsertProduct"],
]) {
  test("two rapid " + kind + " revisions commit in original order, never overwrite the latest state", async () => {
    reset();
    const started = deferred(), allowFirst = deferred();
    const cloudVersions = [];
    cloud.registerRemoteWriter({
      [writerMethod]: async payload => {
        cloudVersions.push(payload.name);
        if (payload.name === "older") {
          started.resolve();
          await allowFirst.promise;
        }
      },
    }, OWNER);
    const first = cloud[method]({ id: kind + "-same-id", name: "older" });
    const second = cloud[method]({ id: kind + "-same-id", name: "newer" });
    await started.promise;
    assert.deepEqual(cloudVersions, ["older"],
      "The second write must remain queued while the first write is running");
    assert.deepEqual(states(), ["pending", "pending"]);
    allowFirst.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(cloudVersions, ["older", "newer"]);
    assert.deepEqual(states(), ["synced", "synced"]);
    assert.equal(cloud.getScopedMasterReplayStatus().pending, 0);
  });

  test("an offline older " + kind + " revision blocks newer direct upsert until ordered replay", async () => {
    reset();
    await cloud[method]({ id: kind + "-offline-id", name: "older offline" });
    assert.deepEqual(states(), ["pending"]);
    const calls = [];
    cloud.registerRemoteWriter({ [writerMethod]: async payload => { calls.push(payload.name); } }, OWNER);
    await cloud[method]({ id: kind + "-offline-id", name: "newer online" });
    assert.deepEqual(calls, [], "Never bypass an unacknowledged predecessor");
    assert.deepEqual(states(), ["pending", "pending"]);
    const replay = await cloud.retryScopedMasterOutbox();
    assert.equal(replay.acknowledged, 2);
    assert.deepEqual(calls, ["older offline", "newer online"]);
    assert.deepEqual(states(), ["synced", "synced"]);
  });
}

test("a failed older master upload leaves newer revision pending and retryable", async () => {
  reset();
  let attempts = 0;
  cloud.registerRemoteWriter({
    upsertCategory: async payload => {
      attempts++;
      if (payload.name === "older failure") throw Error("cloud unavailable");
    },
  }, OWNER);
  await Promise.all([
    cloud.remoteUpsertCategory({ id: "category-failure", name: "older failure" }),
    cloud.remoteUpsertCategory({ id: "category-failure", name: "newer recovery" }),
  ]);
  assert.equal(attempts, 1, "A newer update must not jump past a failed earlier revision");
  assert.deepEqual(states(), ["pending", "pending"]);
  cloud.registerRemoteWriter({upsertCategory: async () => { attempts++; }}, OWNER);
  const replay = await cloud.retryScopedMasterOutbox();
  assert.equal(replay.acknowledged, 2);
  assert.equal(attempts, 3);
  assert.deepEqual(states(), ["synced", "synced"]);
});

test("different aggregate IDs keep independent low-latency cloud delivery", async () => {
  reset();
  const entered = deferred(), release = deferred();
  const uploads = [];
  cloud.registerRemoteWriter({
    upsertCustomer: async payload => {
      uploads.push(payload.id);
      if (payload.id === "slow") { entered.resolve(); await release.promise; }
    },
  }, OWNER);
  const slow = cloud.remoteUpsertCustomer({ id: "slow", name: "Slow customer" });
  await entered.promise;
  await cloud.remoteUpsertCustomer({ id: "fast", name: "Independent customer" });
  assert.deepEqual(uploads, ["slow", "fast"]);
  assert.deepEqual(states(), ["pending", "synced"]);
  release.resolve();
  await slow;
  assert.deepEqual(states(), ["synced", "synced"]);
});

test("logout and rehydration cannot acknowledge old direct master writes", async () => {
  reset();
  const entered = deferred(), release = deferred();
  cloud.registerRemoteWriter({
    upsertProduct: async () => { entered.resolve(); await release.promise; },
  }, OWNER);
  const sending = cloud.remoteUpsertProduct({ id: "stale-product", name: "Pre-restore" });
  await entered.promise;
  const restored = structuredClone(outbox.exportOutbox());
  restored[0].payload.name = "Restored revision";
  outbox.hydrateOutbox(restored);
  cloud.registerRemoteWriter(null);
  outbox.setOutboxScope(null);
  release.resolve();
  await sending;
  assert.equal(restored[0].status, "pending");
  assert.equal(restored[0].payload.name, "Restored revision");
});

test("first scoped direct master write starts synchronously, preserving existing caller contract", async () => {
  reset();
  let started = 0;
  cloud.registerRemoteWriter({ upsertCategory: async () => { started++; } }, OWNER);
  const result = cloud.remoteUpsertCategory({ id: "first-immediate", name: "First customer" });
  assert.equal(started, 1, "Only subsequent revisions should be deferred");
  await result;
  assert.deepEqual(states(), ["synced"]);
});

test("source requires event revision and predecessor checks before dispatching master writes", () => {
  const src = fs.readFileSync("packages/business-logic/src/remote-write.ts", "utf8");
  assert.match(src, /current\.indexOf\(event\)/);
  assert.match(src, /prior\.status === "pending" \|\| prior\.status === "failed"/);
  assert.match(src, /deliverWithCloudAcknowledgement\(\[event\.id\], supports, send, failureLabel\)/);
  for (const method of ["remoteUpsertCustomer", "remoteUpsertCategory", "remoteUpsertProduct"]) {
    const block = src.slice(src.indexOf("export async function " + method), src.indexOf("}\n", src.indexOf("export async function " + method)) + 2);
    assert.match(block, /await deliverMasterInOrder\(/);
  }
});
