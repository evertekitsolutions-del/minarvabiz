import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { assertMemorySyncDemoMode } = require("../sync-demo-policy.ts");

test("in-memory sync is allowed only in explicit demo mode", () => {
  assert.doesNotThrow(() => assertMemorySyncDemoMode("demo"));
  for (const mode of ["production", "development", undefined, "", "offline", "hybrid"]) {
    assert.throws(
      () => assertMemorySyncDemoMode(mode),
      /demo-only.*no cloud transport/i,
      `Unexpectedly allowed in-memory sync for ${String(mode)}`,
    );
  }
});

test("production sync bridge identifies simulation and guards all demo mutations", () => {
  const src = fs.readFileSync("packages/business-logic/src/sync-bridge.ts", "utf8");
  assert.match(src, /cloudSyncAvailable:\s*false/);
  assert.match(src, /demoMode:\s*isDemoMode\(\)/);
  for (const [name, next] of [
    ["runSync", "enqueueDemoWrite"],
    ["enqueueDemoWrite", "setSyncOnline"],
    ["setSyncOnline", "resolveSyncConflict"],
  ]) {
    const start = src.indexOf(`export ${name === "runSync" ? "async " : ""}function ${name}(`);
    const end = src.indexOf(`export function ${next}(`, start);
    assert.ok(start >= 0, `${name} must exist`);
    const body = src.slice(start, end >= 0 ? end : undefined);
    assert.match(body, /assertMemorySyncDemoMode\(getRuntimeMode\(\)\)/, `${name} must fail closed`);
  }
});

test("production settings do not advertise demo memory sync as real cloud transfer", () => {
  const panel = fs.readFileSync("packages/ui/src/components/sync/SyncPanel.tsx", "utf8");
  const page = fs.readFileSync("apps/web/src/app/(app)/settings/page.tsx", "utf8");
  assert.match(panel, /if \(!cloudSyncAvailable && !demoMode\)/);
  assert.match(panel, /Cloud synchronization is not configured/);
  assert.match(panel, /No data is uploaded/);
  assert.match(panel, /In-memory simulation only/);
  assert.match(page, /cloudSyncAvailable=\{snap\.cloudSyncAvailable\}/);
  assert.match(page, /demoMode=\{snap\.demoMode\}/);
});


test("production bridge never invokes the in-memory adapter or marks it connected", async () => {
  const { bridge, runtime, calls } = loadRealBridgeWithIsolatedMemoryTransport();
  runtime.setRuntimeMode("production");
  const snap = bridge.getSyncSnapshot();
  assert.equal(snap.cloudSyncAvailable, false);
  assert.equal(snap.demoMode, false);
  assert.equal(snap.online, false);
  await assert.rejects(bridge.runSync(), /demo-only.*no cloud transport/i);
  assert.throws(() => bridge.enqueueDemoWrite(), /demo-only/);
  assert.throws(() => bridge.setSyncOnline(true), /demo-only/);
  assert.throws(() => bridge.resolveSyncConflict("conflict-1", "local"), /demo-only/);
  assert.deepEqual(calls, { sync: 0, write: 0, toggle: 0, resolve: 0 });
});

test("explicit demo can exercise a simulated session without cloud transport", async () => {
  const { bridge, runtime, calls } = loadRealBridgeWithIsolatedMemoryTransport();
  runtime.setRuntimeMode("demo");
  const snap = bridge.getSyncSnapshot();
  assert.equal(snap.cloudSyncAvailable, false);
  assert.equal(snap.demoMode, true);
  assert.equal(snap.online, true);
  assert.deepEqual(await bridge.runSync(), { status: "completed", simulated: true });
  bridge.enqueueDemoWrite();
  bridge.setSyncOnline(false);
  assert.equal(bridge.getSyncSnapshot().online, false);
  bridge.resolveSyncConflict("conflict-1", "remote");
  assert.deepEqual(calls, { sync: 1, write: 1, toggle: 1, resolve: 1 });
  runtime.setRuntimeMode("production");
});

function loadRealBridgeWithIsolatedMemoryTransport() {
  const Module = require("node:module");
  const runtime = require("../runtime-mode.ts");
  const calls = { sync: 0, write: 0, toggle: 0, resolve: 0 };
  class TestSyncEngine {
    constructor() {
      this.online = true;
      this.outbox = { stats: () => ({ total: 0, pending: 0, synced: 0, conflict: 0, error: 0 }) };
    }
    registerDevice() {}
    isOnline() { return this.online; }
    listSessions() { return []; }
    listConflicts() { return []; }
    listDevices() { return [{ lastSyncAt: null }]; }
    async sync() { calls.sync++; return { status: "completed", simulated: true }; }
    writeLocal() { calls.write++; }
    setOnline(online) { calls.toggle++; this.online = online; }
    resolveConflictManually() { calls.resolve++; return null; }
  }
  const original = Module._load;
  // Only substitute the in-memory transport; execute actual sync-bridge.ts
  // and runtime-mode.ts to cover the user-facing guard.
  Module._load = function(request, parent, isMain) {
    if (request === "@minarvabiz/sync") {
      return {
        SyncEngine: TestSyncEngine,
        MemoryCloudAdapter: class {},
        createMemoryLocalStore: () => ({}),
      };
    }
    if (request === "@minarvabiz/utils") return { generateId: () => "demo-test-device-id" };
    return original.call(this, request, parent, isMain);
  };
  let bridge;
  try {
    delete require.cache[require.resolve("../sync-bridge.ts")];
    bridge = require("../sync-bridge.ts");
  } finally {
    Module._load = original;
  }
  return { bridge, runtime, calls };
}
