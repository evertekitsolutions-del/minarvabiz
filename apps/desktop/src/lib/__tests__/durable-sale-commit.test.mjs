import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createDurableSaleCommit } = require("../durable-sale-commit.ts");

const payload = { customerId: "a", lines: [{ productId: "p", quantity: 1 }], paidAmount: 20 };

test("checkout success waits for native persistence acknowledgment", async () => {
  let acknowledge;
  let creates = 0;
  const commit = createDurableSaleCommit(
    () => { creates++; return { errors: [], sale: { id: "s1", invoiceNumber: "INV-1" } }; },
    () => new Promise(resolve => { acknowledge = resolve; }),
  );
  const request = commit.submit(payload);
  assert.equal(creates, 1);
  assert.equal(commit.hasPending(), true);
  let settled = false;
  void request.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal((await commit.submit(payload)).success, false);
  acknowledge(true);
  assert.deepEqual(await request, { success: true, saleId: "s1", invoiceNumber: "INV-1" });
  assert.equal(commit.hasPending(), false);
});

test("failed write and later retry never duplicate sale effects", async () => {
  let creates = 0, writes = 0;
  const commit = createDurableSaleCommit(
    () => { creates++; return { errors: [], sale: { id: "s1", invoiceNumber: "INV-1" } }; },
    async () => ++writes > 1,
  );
  const failed = await commit.submit(payload);
  assert.equal(failed.success, false);
  assert.match(failed.errors[0], /retry the same checkout/i);
  assert.equal(commit.hasPending(), true);
  const second = await commit.submit({ ...payload, paidAmount: 25 });
  assert.equal(second.success, false);
  assert.match(second.errors[0], /previous invoice/i);
  assert.equal(writes, 1);
  assert.deepEqual(await commit.submit({ ...payload }), { success: true, saleId: "s1", invoiceNumber: "INV-1" });
  assert.equal(creates, 1);
  assert.equal(writes, 2);
  assert.equal(commit.hasPending(), false);
});

test("thrown disk error retains pending checkout for explicit save retry", async () => {
  let creates = 0, writes = 0;
  const commit = createDurableSaleCommit(
    () => { creates++; return { errors: [], sale: { id: "s1", invoiceNumber: "INV-1" } }; },
    async () => { if (++writes === 1) throw new Error("EACCES"); return true; },
  );
  assert.match((await commit.submit(payload)).errors[0], /EACCES/);
  assert.equal(commit.hasPending(), true);
  assert.equal((await commit.retryPending()).success, true);
  assert.equal(creates, 1);
  assert.equal(commit.hasPending(), false);
});

test("validation failures create no pending success and a later valid sale can proceed", async () => {
  let attempts = 0;
  const commit = createDurableSaleCommit(
    () => ++attempts === 1
      ? { errors: ["Insufficient stock"] }
      : { errors: [], sale: { id: "s2", invoiceNumber: "INV-2" } },
    async () => true,
  );
  assert.deepEqual(await commit.submit(payload), { success: false, errors: ["Insufficient stock"] });
  assert.equal(commit.hasPending(), false);
  assert.equal((await commit.submit(payload)).saleId, "s2");
});
