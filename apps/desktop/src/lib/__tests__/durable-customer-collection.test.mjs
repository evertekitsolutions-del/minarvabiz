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
