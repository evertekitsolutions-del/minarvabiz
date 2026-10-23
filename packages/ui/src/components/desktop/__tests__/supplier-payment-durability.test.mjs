import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { parseSupplierAmountInput } = require("../supplier-amount-input.ts");
const { createDurableCollection } = require("../../payments/durable-collection.ts");

test("supplier opening balance defaults only when blank and preserves exact cents", () => {
  for (const [raw, expected] of [["", 0], ["   ", 0], ["0", 0], ["001.20", 1.2],
    ["120.50", 120.5], ["900.01", 900.01]]) {
    assert.equal(parseSupplierAmountInput(raw, "opening"), expected);
  }
  assert.equal(parseSupplierAmountInput("0.01", "payment"), 0.01);
});

test("supplier payments cannot silently coerce invalid, truncated or unsupported amounts", () => {
  for (const raw of ["", " ", "1abc", "1e3", "1.001", "0", "0.00", "-1.00",
    "+2.00", ".05", "Infinity", "NaN", "999999999999999999", "1,000.00"]) {
    assert.throws(() => parseSupplierAmountInput(raw, "payment"), undefined, raw);
  }
  for (const raw of ["1abc", "1.001", "1e2", "-0.01", "+2", "999999999999999999"]) {
    assert.throws(() => parseSupplierAmountInput(raw, "opening"), undefined, raw);
  }
});

test("supplier settlement never creates a second payment if native SQLite rejects its first save", async () => {
  let creates = 0, writes = 0;
  const durable = createDurableCollection(
    () => ({ payment: { id: "pay-" + ++creates }, errors: [] }),
    async () => ++writes > 1,
  );
  const input = { supplierId: "s1", amount: parseSupplierAmountInput("110.25", "payment") };
  assert.equal((await durable.collect(input)).ok, false);
  assert.equal(durable.hasPending(), true);
  assert.equal((await durable.collect(input)).ok, false);
  assert.equal(creates, 1);
  assert.deepEqual(await durable.retryPending(), { ok: true, paymentId: "pay-1" });
  assert.equal(writes, 2);
  assert.equal(creates, 1);
});

test("payment domain rejection never invokes disk save or retains pending mutation", async () => {
  let writes = 0;
  const durable = createDurableCollection(
    () => ({ payment: null, errors: ["Payable is already settled"] }),
    async () => { writes++; return true; },
  );
  assert.match((await durable.collect({ supplierId: "s1", amount: 20 })).error, /settled/);
  assert.equal(durable.hasPending(), false);
  assert.equal(writes, 0);
});