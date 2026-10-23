import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createDurableCsvImport } = require("../durable-csv-import.ts");

const csv = "name,phone\nTest Shop,9999988888";
const kinds = ["products", "customers", "suppliers"];

test("a customer bulk import creates records once and waits for the native SQLite save", async () => {
  let ack, created = 0, validations = 0;
  const eng = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => { validations++; return { rows: [{ name: kind }], errors: [] }; },
    apply: () => { created++; return { created: 1, errors: [] }; },
  }]));
  const importer = createDurableCsvImport(eng, () => new Promise(resolve => { ack = resolve; }));
  assert.equal(importer.preview("customers", csv).rows.length, 1);
  const operation = importer.commit("customers", csv);
  assert.equal(importer.hasPending(), true);
  assert.equal(importer.isBusy(), true);
  assert.equal((await importer.commit("customers", csv)).ok, false);
  assert.equal(importer.preview("products", csv).errors.length, 1);
  assert.equal(created, 1);
  ack(true);
  assert.deepEqual(await operation, { ok: true, created: 1 });
  assert.equal(importer.hasPending(), false);
  assert.equal(validations, 1);
});

test("failed SQLite acknowledgment blocks every new bulk import but retry does not create duplicates", async () => {
  let creations = 0, writes = 0;
  const eng = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => ({ rows: [kind], errors: [] }),
    apply: () => { creations++; return { created: 2, errors: [] }; },
  }]));
  const importer = createDurableCsvImport(eng, async () => ++writes > 1);
  assert.equal((await importer.commit("products", csv)).ok, false);
  assert.equal(importer.pendingKind(), "products");
  assert.equal((await importer.commit("suppliers", csv)).ok, false);
  assert.equal(importer.preview("customers", csv).rows.length, 0);
  assert.deepEqual(await importer.retryPersist(), { ok: true, created: 2 });
  assert.equal(creations, 1);
  assert.equal(writes, 2);
  assert.equal(importer.hasPending(), false);
});

test("invalid batch never starts persistence or marks an unsaved import", async () => {
  let writes = 0;
  const eng = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => ({ rows: [], errors: ["Row 2: duplicate customer phone"] }),
    apply: () => ({ created: 0, errors: ["Row 2: duplicate customer phone"] }),
  }]));
  const importer = createDurableCsvImport(eng, async () => { writes++; return true; });
  assert.match((await importer.commit("customers", csv)).error, /duplicate customer phone/);
  assert.equal(importer.hasPending(), false);
  assert.equal(writes, 0);
  assert.equal((await importer.retryPersist()).ok, false);
});

test("native exception retains pending records for exactly-once recovery", async () => {
  let applies = 0, tries = 0;
  const eng = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => ({ rows: [{ name: kind }], errors: [] }),
    apply: () => { applies++; return { created: 1, errors: [] }; },
  }]));
  const importer = createDurableCsvImport(eng, async () => {
    if (++tries === 1) throw new Error("EACCES");
    return true;
  });
  assert.match((await importer.commit("suppliers", csv)).error, /EACCES/);
  assert.equal(importer.hasPending(), true);
  assert.equal((await importer.retryPersist()).ok, true);
  assert.equal(applies, 1);
});


test("domain exception after partial mutation permanently blocks a second import in this session", async () => {
  let applies = 0, writes = 0;
  const engines = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => ({ rows: [kind], errors: [] }),
    apply: () => { applies++; throw new Error("partial mutation"); },
  }]));
  const importer = createDurableCsvImport(engines, async () => { writes++; return true; });
  assert.match((await importer.commit("customers", csv)).error, /partial mutation/);
  assert.equal(importer.requiresReview(), true);
  assert.match((await importer.commit("customers", csv)).error, /reconcile existing records/i);
  assert.match(importer.preview("products", csv).errors[0], /reconcile existing records/i);
  assert.equal((await importer.retryPersist()).ok, false);
  assert.equal(applies, 1);
  assert.equal(writes, 0);
});

test("mixed partial successes/errors and failed rollback responses latch review state", async () => {
  for (const result of [
    { created: 1, errors: ["Row 3 failed"] },
    { created: 0, errors: ["Rollback failed: disk error"] },
    { created: 0, errors: ["Snapshot recovery also failed: corrupt state"] },
  ]) {
    let applies = 0, writes = 0;
    const engines = Object.fromEntries(kinds.map(kind => [kind, {
      preview: () => ({ rows: [kind], errors: [] }),
      apply: () => { applies++; return result; },
    }]));
    const importer = createDurableCsvImport(engines, async () => { writes++; return true; });
    assert.equal((await importer.commit("suppliers", csv)).ok, false);
    assert.equal(importer.requiresReview(), true);
    assert.equal((await importer.commit("products", csv)).ok, false);
    assert.equal(applies, 1);
    assert.equal(writes, 0);
  }
});

test("valid operator correction after a fully rejected CSV remains allowed", async () => {
  let applies = 0;
  const engines = Object.fromEntries(kinds.map(kind => [kind, {
    preview: () => ({ rows: [kind], errors: [] }),
    apply: () => (++applies === 1
      ? { created: 0, errors: ["Duplicate phone"] }
      : { created: 1, errors: [] }),
  }]));
  const importer = createDurableCsvImport(engines, async () => true);
  assert.equal((await importer.commit("customers", csv)).ok, false);
  assert.equal(importer.requiresReview(), false);
  assert.deepEqual(await importer.commit("customers", csv), { ok: true, created: 1 });
});
