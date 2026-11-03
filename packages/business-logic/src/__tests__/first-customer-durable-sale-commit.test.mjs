import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  filename,
);
const { createDurableSaleCommit } = require(
  "../../../../apps/desktop/src/lib/durable-sale-commit.ts",
);

const payload = (id, amount = 100) => ({ id, amount });
const created = (id) => ({
  errors: [],
  sale: { id: `sale-${id}`, invoiceNumber: `INV-${id}` },
});

test("failed native persistence retains one invoice and blocks a different checkout", async () => {
  let creates = 0;
  let writes = 0;
  const commit = createDurableSaleCommit(
    (input) => { creates++; return created(input.id); },
    async () => { writes++; return writes > 1; },
  );

  const first = await commit.submit(payload("A"));
  assert.equal(first.success, false);
  assert.match(first.errors[0], /existing invoice is pending/);
  assert.equal(commit.hasPending(), true);
  assert.equal(creates, 1);

  const different = await commit.submit(payload("B"));
  assert.equal(different.success, false);
  assert.match(different.errors[0], /previous invoice has not been saved/);
  assert.equal(creates, 1, "A second invoice must not be created while the first is unsaved");

  const retry = await commit.submit(payload("A"));
  assert.deepEqual(retry, {
    success: true,
    saleId: "sale-A",
    invoiceNumber: "INV-A",
  });
  assert.equal(commit.hasPending(), false);
  assert.equal(creates, 1, "Retry persists the original invoice instead of replaying createSale");
});

test("recovery-banner retry returns the same receipt to a still-open identical form", async () => {
  let creates = 0;
  let writes = 0;
  const commit = createDurableSaleCommit(
    (input) => { creates++; return created(input.id); },
    async () => ++writes > 1,
  );

  assert.equal((await commit.submit(payload("RECOVER"))).success, false);
  const recovered = await commit.retryPending();
  assert.deepEqual(recovered, {
    success: true,
    saleId: "sale-RECOVER",
    invoiceNumber: "INV-RECOVER",
  });
  assert.equal(commit.hasPending(), false);

  const staleFormSubmit = await commit.submit(payload("RECOVER"));
  assert.deepEqual(staleFormSubmit, recovered);
  assert.equal(creates, 1, "Stale open form must consume recovery receipt, not create a duplicate sale");

  const nextSale = await commit.submit(payload("NEXT"));
  assert.equal(nextSale.success, true);
  assert.equal(nextSale.saleId, "sale-NEXT");
  assert.equal(creates, 2, "A distinct checkout is allowed after durable recovery");
});

test("native IPC rejection and thrown writes remain retryable without duplicate accounting mutations", async () => {
  let creates = 0;
  let attempt = 0;
  const commit = createDurableSaleCommit(
    (input) => { creates++; return created(input.id); },
    async () => {
      attempt++;
      if (attempt === 1) throw new Error("disk full");
      if (attempt === 2) return false;
      return true;
    },
  );

  const thrown = await commit.submit(payload("DISK"));
  assert.equal(thrown.success, false);
  assert.match(thrown.errors[0], /SQLite save failed: disk full/);
  const rejected = await commit.retryPending();
  assert.equal(rejected.success, false);
  assert.match(rejected.errors[0], /SQLite did not confirm/);
  const saved = await commit.retryPending();
  assert.equal(saved.success, true);
  assert.equal(saved.saleId, "sale-DISK");
  assert.equal(creates, 1);
  assert.equal(commit.hasPending(), false);
});

test("concurrent submit is rejected while the durable write is in flight", async () => {
  let creates = 0;
  let resolveWrite;
  const write = new Promise((resolve) => { resolveWrite = resolve; });
  const commit = createDurableSaleCommit(
    (input) => { creates++; return created(input.id); },
    () => write,
  );

  const firstPromise = commit.submit(payload("LOCK"));
  await Promise.resolve();
  const concurrent = await commit.submit(payload("LOCK"));
  assert.equal(concurrent.success, false);
  assert.match(concurrent.errors[0], /already being saved/);
  assert.equal(creates, 1);

  resolveWrite(true);
  const first = await firstPromise;
  assert.equal(first.success, true);
  assert.equal(first.saleId, "sale-LOCK");
  assert.equal(creates, 1);
});

test("business validation failure creates no pending invoice and permits corrected checkout", async () => {
  let creates = 0;
  const commit = createDurableSaleCommit(
    (input) => {
      creates++;
      return input.valid ? created(input.id) : { errors: ["Insufficient stock"] };
    },
    async () => true,
  );

  const invalid = await commit.submit({ id: "INVALID", valid: false });
  assert.equal(invalid.success, false);
  assert.deepEqual(invalid.errors, ["Insufficient stock"]);
  assert.equal(commit.hasPending(), false);

  const corrected = await commit.submit({ id: "VALID", valid: true });
  assert.equal(corrected.success, true);
  assert.equal(corrected.saleId, "sale-VALID");
  assert.equal(creates, 2);
});

test("late stale-form replay remains deduplicated after a different checkout", async () => {
  let creates = 0;
  let writes = 0;
  const commit = createDurableSaleCommit(
    (input) => { creates++; return created(input.id); },
    async () => ++writes > 1,
  );

  assert.equal((await commit.submit(payload("LATE"))).success, false);
  const recovered = await commit.retryPending();
  assert.equal(recovered.success, true);

  const nextSale = await commit.submit(payload("NEXT-AFTER-RECOVERY"));
  assert.equal(nextSale.success, true);
  assert.equal(nextSale.saleId, "sale-NEXT-AFTER-RECOVERY");
  assert.equal(creates, 2);

  const lateStaleSubmit = await commit.submit(payload("LATE"));
  assert.deepEqual(lateStaleSubmit, recovered);
  assert.equal(creates, 2, "Late replay of the recovered form must not create a third invoice");
});
