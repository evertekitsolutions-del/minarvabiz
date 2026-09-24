import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  filename
);

const statements = require("../accounting-statements.ts");

const accounts = [
  { id: "cash", code: "1000", name: "Cash", type: "asset", normalBalance: "debit", isActive: true },
  { id: "sales", code: "4000", name: "Sales", type: "income", normalBalance: "credit", isActive: true },
];

const journals = [
  {
    id: "j1", journalNumber: "JV-1", entryDate: "2026-09-24", description: "A", status: "posted",
    lines: [
      { accountId: "cash", debit: 0.1, credit: 0 },
      { accountId: "sales", debit: 0, credit: 0.1 },
    ],
  },
  {
    id: "j2", journalNumber: "JV-2", entryDate: "2026-09-24", description: "B", status: "posted",
    lines: [
      { accountId: "cash", debit: 0.2, credit: 0 },
      { accountId: "sales", debit: 0, credit: 0.2 },
    ],
  },
];

const pnl = statements.calculateProfitAndLoss(accounts, journals);
assert.equal(pnl.totalIncome, 0.3);
assert.equal(pnl.totalExpenses, 0);
assert.equal(pnl.netProfit, 0.3);

const balanceSheet = statements.calculateBalanceSheet(accounts, journals);
assert.equal(balanceSheet.totalAssets, 0.3);
assert.equal(balanceSheet.unclosedEarnings, 0.3);
assert.equal(balanceSheet.liabilitiesAndEquity, 0.3);
assert.equal(balanceSheet.difference, 0);
assert.equal(balanceSheet.balanced, true);

const accountingStoreSource = fs.readFileSync(new URL("../accounting-store.ts", import.meta.url), "utf8");
const accountingStatementsSource = fs.readFileSync(new URL("../accounting-statements.ts", import.meta.url), "utf8");

for (const source of [accountingStoreSource, accountingStatementsSource]) {
  assert.doesNotMatch(source, /Math\.round/);
  assert.doesNotMatch(source, /Number\.EPSILON/);
  assert.doesNotMatch(source, /\.toFixed\(/);
}
assert.match(accountingStoreSource, /toMinorUnits/);
assert.match(accountingStoreSource, /fromMinorUnits/);
assert.match(accountingStoreSource, /formatMinorUnits/);
assert.match(accountingStatementsSource, /subtractMinorUnits/);
assert.match(accountingStatementsSource, /addMinorUnits/);

console.log("Accounting minor-unit arithmetic tests passed");
