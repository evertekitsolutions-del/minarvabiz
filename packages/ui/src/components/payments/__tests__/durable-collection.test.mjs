import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createDurableCollection } = require("../durable-collection.ts");
const input = { customerId: "c1", amount: 100, method: "cash" };

test("customer collection UI success waits for durable native disk acknowledgment", async () => {
  let release;
  let creates = 0;
  const save = createDurableCollection(
    () => { creates++; return { payment: { id: "pay-1" }, errors: [] }; },
    () => new Promise(resolve => { release = resolve; }),
  );
  const first = save.collect(input);
  assert.equal(save.pendingPaymentId(), "pay-1");
  assert.equal((await save.collect(input)).ok, false);
  let settled = false;
  void first.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  release(true);
  assert.deepEqual(await first, { ok: true, paymentId: "pay-1" });
  assert.equal(creates, 1);
  assert.equal(save.hasPending(), false);
});

test("failed native write holds same payment and stops duplicate allocations and journals", async () => {
  let creates = 0, writes = 0;
  const save = createDurableCollection(
    () => { creates++; return { payment: { id: "pay-1" }, errors: [] }; },
    async () => ++writes > 1,
  );
  assert.match((await save.collect(input)).error, /same payment.*pending/i);
  assert.equal(save.hasPending(), true);
  assert.match((await save.collect({ ...input, amount: 150 })).error, /earlier customer payment/i);
  assert.equal(creates, 1);
  assert.equal(writes, 1);
  assert.deepEqual(await save.retryPending(), { ok: true, paymentId: "pay-1" });
  assert.equal(save.consumeRecoveredPaymentId(), "pay-1");
  assert.equal(save.consumeRecoveredPaymentId(), null);
  assert.equal(creates, 1);
  assert.equal(writes, 2);
});

test("failed IPC exception is not acknowledged, but a later retry persists one payment", async () => {
  let creates = 0, writes = 0;
  const save = createDurableCollection(
    () => { creates++; return { payment: { id: "pay-x" }, errors: [] }; },
    async () => { if (++writes === 1) throw new Error("EACCES"); return true; },
  );
  assert.match((await save.collect(input)).error, /EACCES/);
  assert.equal(save.pendingPaymentId(), "pay-x");
  assert.equal((await save.retryPending()).ok, true);
  assert.equal(creates, 1);
});

test("domain validation rejection never queues a phantom payment or SQLite write", async () => {
  let writes = 0;
  const save = createDurableCollection(
    () => ({ payment: null, errors: ["Insufficient outstanding"] }),
    async () => { writes++; return true; },
  );
  assert.deepEqual(await save.collect(input), { ok: false, error: "Insufficient outstanding" });
  assert.equal(save.hasPending(), false);
  assert.equal(writes, 0);
});


test("late stale-form replay after recovery returns the original payment receipt", async () => {
  let creates = 0, writes = 0;
  const save = createDurableCollection(
    () => ({ payment: { id: "pay-recovered-" + (++creates) }, errors: [] }),
    async () => ++writes > 1,
  );
  assert.equal((await save.collect(input)).ok, false);
  const recovered = await save.retryPending();
  assert.deepEqual(recovered, { ok: true, paymentId: "pay-recovered-1" });

  const different = await save.collect({ ...input, amount: 125 });
  assert.deepEqual(different, { ok: true, paymentId: "pay-recovered-2" });
  const lateStaleReplay = await save.collect(input);
  assert.deepEqual(lateStaleReplay, recovered);
  assert.equal(creates, 2, "late stale submit must not create a third payment");
  assert.equal(writes, 3, "stale replay must not write a new SQLite image");
});

test("ordinary successful identical collections remain separate legitimate payments", async () => {
  let creates = 0;
  const save = createDurableCollection(
    () => ({ payment: { id: "pay-normal-" + (++creates) }, errors: [] }),
    async () => true,
  );
  assert.equal((await save.collect(input)).paymentId, "pay-normal-1");
  assert.equal((await save.collect(input)).paymentId, "pay-normal-2");
  assert.equal(creates, 2);
});
