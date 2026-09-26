import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const accounting = require("../accounting-store.ts");
const permissions = require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const chart = accounting.exportAccountingState().accounts;
accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });

const id = (key) => accounting.getSystemAccount(key).id;
function post(date, description, lines) {
  const created = accounting.createJournalEntry({ entryDate: date, description, lines });
  assert.deepEqual(created.errors, []);
  assert(created.journalEntry);
  const posted = accounting.postJournalEntry(created.journalEntry.id);
  assert.deepEqual(posted.errors, []);
}

post("2026-01-10", "Output GST", [
  { accountId: id("cash"), debit: 18 },
  { accountId: id("tax_payable"), credit: 18 },
]);
post("2026-01-11", "Eligible input GST", [
  { accountId: id("input_tax"), debit: 5 },
  { accountId: id("bank"), credit: 5 },
]);
post("2026-01-12", "Purchase tax pending review", [
  { accountId: id("purchase_tax_pending"), debit: 2 },
  { accountId: id("bank"), credit: 2 },
]);
post("2026-02-01", "Output tax adjustment", [
  { accountId: id("tax_payable"), debit: 3 },
  { accountId: id("cash"), credit: 3 },
]);

const jan = accounting.buildTaxReconciliation("2026-01-01", "2026-01-31");
assert.equal(jan.periodOutputTax, 18);
assert.equal(jan.periodInputTax, 5);
assert.equal(jan.periodPurchaseTaxPending, 2);
assert.equal(jan.outputTaxPayable, 18);
assert.equal(jan.inputTaxCredit, 5);
assert.equal(jan.purchaseTaxPending, 2);
assert.equal(jan.netTaxPosition, 13);
assert.equal(jan.reviewRequired, true);

const feb = accounting.buildTaxReconciliation("2026-02-01", "2026-02-28");
assert.equal(feb.periodOutputTax, -3);
assert.equal(feb.outputTaxPayable, 15);
assert.equal(feb.inputTaxCredit, 5);
assert.equal(feb.netTaxPosition, 10);

const all = accounting.buildTaxReconciliation(undefined, "2026-02-28");
assert.equal(all.periodOutputTax, 15);
assert.equal(all.netTaxPosition, 10);
assert.throws(() => accounting.buildTaxReconciliation("2026-03-01", "2026-02-01"), /start date/i);
assert.throws(() => accounting.buildTaxReconciliation("2026-02-30", "2026-03-01"), /valid report date/i);

console.log("Tax reconciliation report PASS");
