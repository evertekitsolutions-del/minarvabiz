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
const suppliers = require("../phase5-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);
function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(accounts), journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [], purchases: [], laundryOrders: [], expenses: [], expenseCategories: [] });
  outbox.hydrateOutbox([]);
}
const state = () => JSON.stringify({
  suppliers: suppliers.listSuppliers(),
  journals: accounting.exportAccountingState(),
  outbox: outbox.exportOutbox(),
});
const create = () => suppliers.createSupplier({ name: "New Fabric Vendor", openingBalance: 55.50 });

test("supplier creation fails closed when initial accounting commit returns null", () => {
  reset();
  const before = state();
  const existing = accounting.planAutomaticPosting;
  try {
    accounting.planAutomaticPosting = () => ({ errors: [], commit: () => null });
    assert.throws(create, /opening supplier balance posting failed/i);
    assert.equal(state(), before, "no phantom supplier or queued record on null");
  } finally {
    accounting.planAutomaticPosting = existing;
  }
});

test("supplier creation does not leak a new supplier if the journal throws", () => {
  reset();
  const before = state();
  const existing = accounting.planAutomaticPosting;
  try {
    accounting.planAutomaticPosting = () => ({
      errors: [], commit: () => { throw new Error("ledger unavailable"); },
    });
    assert.throws(create, /ledger unavailable/);
    assert.equal(state(), before, "failed supplier journal must not expose the new master");
  } finally {
    accounting.planAutomaticPosting = existing;
  }
});

test("valid supplier opening payable still creates balanced journal and supplier", () => {
  reset();
  const supplier = create();
  assert.equal(supplier.outstandingBalance, 55.5);
  assert.equal(suppliers.getSupplier(supplier.id).outstandingBalance, 55.5);
  assert.equal(accounting.listJournalEntries().length, 1);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
  assert.equal(suppliers.listSuppliers().length, 1);
});
