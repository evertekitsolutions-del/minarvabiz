import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createDurableCustomerCollection } = require("../durable-customer-collection.ts");
const payload = { customerId: "c1", amount: 50, method: "cash" };

test("collection reports success only after SQLite acknowledges the payment", async () => {
  let release;
  let creates = 0;
  const flow = createDurableCustomerCollection(
    () => ({ payment: { id: "p1" }, errors: [] }),
    () => new Promise(resolve => { release = resolve; }),
  );
  const pending = flow.collect(payload);
  assert.equal(flow.hasPending(), true);
  assert.match((await flow.collect(payload)).error, /earlier customer payment/i);
  release(true);
  assert.deepEqual(await pending, { ok: true, paymentId: "p1" });
  assert.equal(flow.hasPending(), false);
});

test("failed or thrown SQLite writes retain one payment for persistence-only retry", async () => {
  let creates = 0, writes = 0;
  const flow = createDurableCustomerCollection(
    () => ({ payment: { id: "p" + (++creates) }, errors: [] }),
    async () => { if (++writes === 1) throw new Error("EACCES"); return true; },
  );
  assert.match((await flow.collect(payload)).error, /EACCES/);
  assert.equal(flow.hasPending(), true);
  assert.match((await flow.collect({ ...payload, amount: 75 })).error, /earlier customer payment/i);
  assert.deepEqual(await flow.retryPending(), { ok: true, paymentId: "p1" });
  assert.equal(creates, 1);
  assert.equal(writes, 2);
});

test("domain validation rejection creates no pending payment and performs no write", async () => {
  let writes = 0;
  const flow = createDurableCustomerCollection(
    () => ({ payment: null, errors: ["No outstanding balance"] }),
    async () => { writes++; return true; },
  );
  assert.deepEqual(await flow.collect(payload), { ok: false, error: "No outstanding balance" });
  assert.equal(flow.hasPending(), false);
  assert.equal(writes, 0);
});

test("false acknowledgement and concurrent retries retain exactly one desktop payment", async () => {
  let creates = 0, writes = 0, release;
  const flow = createDurableCustomerCollection(
    () => ({ payment: { id: "p" + (++creates) }, errors: [] }),
    async () => {
      writes++;
      if (writes === 1) return false;
      return new Promise(resolve => { release = resolve; });
    },
  );
  assert.equal((await flow.collect(payload)).ok, false);
  assert.equal(flow.hasPending(), true);
  const retry = flow.retryPending();
  assert.equal((await flow.retryPending()).ok, false);
  assert.equal((await flow.collect({ ...payload, amount: 75 })).ok, false);
  assert.equal(creates, 1);
  assert.equal(writes, 2);
  assert.equal(flow.hasPending(), true);
  release(true);
  assert.deepEqual(await retry, { ok: true, paymentId: "p1" });
  assert.equal(flow.hasPending(), false);
  assert.equal((await flow.retryPending()).ok, false);
  assert.equal(creates, 1);
  assert.equal(writes, 2);
});

test("navigation retains an unsaved customer collection in the app coordinator", async () => {
  let created = 0, saved = 0;
  const appCoordinator = createDurableCustomerCollection(
    () => ({ payment: { id: "payment-" + (++created) }, errors: [] }),
    async () => ++saved > 1,
  );
  const mountCustomerView = () => ({
    hasPending: () => appCoordinator.hasPending(),
    collect: input => appCoordinator.collect(input),
    retry: () => appCoordinator.retryPending(),
  });
  const firstMount = mountCustomerView();
  assert.equal((await firstMount.collect(payload)).ok, false);
  assert.equal(firstMount.hasPending(), true);
  // Simulate leaving Customers and returning: the app-scoped coordinator survives.
  const secondMount = mountCustomerView();
  assert.equal(secondMount.hasPending(), true);
  assert.equal((await secondMount.collect(payload)).ok, false);
  assert.deepEqual(await secondMount.retry(), { ok: true, paymentId: "payment-1" });
  assert.equal(created, 1);
  assert.equal(saved, 2);
});

test("desktop navigation mounts the same collection coordinator and exposes retry banner", () => {
  const app = fs.readFileSync("apps/desktop/src/App.tsx", "utf8");
  const panel = fs.readFileSync("apps/desktop/src/components/DesktopCustomerMasterPanel.tsx", "utf8");
  const hook = fs.readFileSync("apps/desktop/src/lib/use-desktop-customer-collection.ts", "utf8");
  assert.match(app, /useDesktopCustomerCollection\(persistCustomerCollection\)/);
  assert.match(hook, /React\.useState\(\(\) => createDurableCustomerCollection\(/);
  assert.match(app, /collection=\{customerCollection\}/);
  assert.match(panel, /collection\.hasPending\(\) && !collectionTarget/);
  assert.match(panel, /Retry pending payment save/);
  assert.doesNotMatch(panel, /createDurableCustomerCollection\(/);
});
