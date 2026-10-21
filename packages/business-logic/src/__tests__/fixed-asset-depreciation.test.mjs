import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename,
);
const { buildAssetDepreciationSchedule } = require("../fixed-asset-depreciation.ts");
const base = {
  assetReference: "FA-100", assetName: "CCTV Service Van",
  depreciationStartDate: "2026-01-31",
  acquisitionCost: "120000.00", residualValue: "12000",
  usefulLifeMonths: 36,
};
const schedule = patch => buildAssetDepreciationSchedule({ ...base, ...patch });

test("36 months of straight-line depreciation reconcile exactly", () => {
  const p = schedule({});
  assert.equal(p.periods.length, 36);
  assert.equal(p.totalDepreciation, 108000);
  assert.equal(p.periods[0].expense, 3000);
  assert.deepEqual(p.periods.slice(0, 3).map(r => r.postingDate), [
    "2026-01-31", "2026-02-28", "2026-03-31",
  ]);
  assert.equal(p.periods.at(-1).closingBookValue, 12000);
  assert.equal(p.periods.at(-1).accumulatedDepreciation, 108000);
  assert.equal(p.periods.reduce((sum,r)=>sum+Math.round(r.expense*100),0),10800000);
});

test("remainder pennies are distributed deterministically with no final balloon", () => {
  const p = schedule({
    acquisitionCost: "100.00", residualValue: "0.00", usefulLifeMonths: 3,
  });
  assert.deepEqual(p.periods.map(r => r.expense), [33.34, 33.33, 33.33]);
  assert.equal(p.periods.at(-1).closingBookValue, 0);
  assert.deepEqual(schedule({
    acquisitionCost: "100.00", residualValue: "0.00", usefulLifeMonths: 3,
  }), p);
});

test("end-of-month dates work through leap years and new years", () => {
  const p = schedule({ depreciationStartDate:"2024-02-29", usefulLifeMonths: 13 });
  assert.deepEqual(p.periods.slice(0,3).map(r=>r.postingDate),[
    "2024-02-29", "2024-03-31", "2024-04-30",
  ]);
  assert.equal(p.periods[11].postingDate,"2025-01-31");
  assert.equal(p.periods[12].postingDate,"2025-02-28");
});

test("one-month and 360-month plans remain bounded and reconcile", () => {
  const one = schedule({ usefulLifeMonths: 1, acquisitionCost:"2.00", residualValue:"1.99" });
  assert.deepEqual([one.periods[0].expense,one.periods[0].closingBookValue],[0.01,1.99]);
  const long = schedule({ usefulLifeMonths: 360 });
  assert.equal(long.periods.length, 360);
  assert.equal(long.periods.at(-1).closingBookValue,12000);
});

test("reject invalid money, negative, overprecision, unsafe and nonnumeric values", () => {
  for (const value of ["", "-1", "1.234", "1,000.00", "NaN", "Infinity", "1e3", "90071992547409.99", "$1"]) {
    assert.throws(() => schedule({ acquisitionCost: value }));
  }
  for (const value of ["-1", "1.001", "NaN", "120000.00", "120000.01", "90071992547409.99"]) {
    assert.throws(() => schedule({ residualValue: value }));
  }
  assert.throws(()=>schedule({ acquisitionCost: "0.00", residualValue: "0" }));
});

test("reject invalid dates, life limits and missing asset identity", () => {
  for (const date of ["2026-02-29", "2026-13-01", "2026/01/31", "1999-12-31", ""]) {
    assert.throws(() => schedule({ depreciationStartDate: date }));
  }
  for (const months of [0,361,2.5,NaN,Infinity]) {
    assert.throws(() => schedule({ usefulLifeMonths: months }));
  }
  assert.throws(()=>schedule({ assetName: " " }),/required/);
  assert.throws(()=>schedule({ assetReference: "" }),/required/);
});

test("CSV output is escaped, formula-safe and matches period count", () => {
  const p = schedule({ assetName:'=SUM(1,2)\n"test"', assetReference:"@FA" });
  assert.match(p.csv, /"'@FA"/);
  assert.match(p.csv, /"'=SUM\(1,2\)\n""test"""/);
  assert.equal(p.csv.split("\r\n").length-2,p.periods.length);
});

test("Web/Windows Accounting screen exposes dedicated non-posting fixed asset tab", () => {
  const ui=fs.readFileSync(new URL("../../../ui/src/components/accounting/FixedAssetDepreciationPanel.tsx", import.meta.url), "utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountingPanel.tsx", import.meta.url), "utf8");
  assert.match(ui,/Preview depreciation/);
  assert.match(ui,/Export depreciation CSV/);
  assert.match(ui,/buildAssetDepreciationSchedule/);
  assert.match(host,/tabButton\("assets", "Fixed Assets"\)/);
  assert.match(host,/<FixedAssetDepreciationPanel \/>/);
});
