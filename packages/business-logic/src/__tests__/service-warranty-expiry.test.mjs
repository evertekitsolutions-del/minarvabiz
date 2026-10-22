import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../service-warranty-expiry.ts", import.meta.url);
const source = fs.readFileSync(filename, "utf8");
const js = ts.transpileModule(source, {
  fileName: filename.pathname,
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const mod = {exports: {}};
new Function("require", "module", "exports", js)(() => {
  throw new Error("Unexpected runtime dependency");
}, mod, mod.exports);
const {buildServiceWarrantyExpiryReport: build, exportServiceWarrantyExpiryCsv: toCsv} = mod.exports;
function warranty(id, endsOn, assetReference = "NVR-01") {
  return {id, branchId:"branch1", orderId:"order1", customerId:"customer1",
    assetReference, startsOn:"2026-01-01", endsOn, coverageTerms:"",
    version:1, createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-01-01T00:00:00.000Z"};
}
test("expiring, due today, expired and beyond horizon are distinct and inclusive", () => {
  const rows = [
    warranty("a","2026-10-21"),
    warranty("b","2026-10-22"),
    warranty("c","2026-11-21"),
    warranty("d","2026-11-22"),
  ];
  const copy=structuredClone(rows);
  const report=build(rows,"2026-10-22",30);
  assert.deepEqual([report.expiredCount, report.dueSoonCount,
    report.outsideHorizonCount], [1,2,1]);
  assert.deepEqual(report.rows.map(x=>[x.warrantyId,x.daysRemaining,x.status]), [
    ["a",-1,"expired"], ["b",0,"due_today"], ["c",30,"due_soon"]
  ]);
  assert.deepEqual(rows,copy,"source records must not change");
  assert.equal(build(rows,"2026-10-22",60).rows.length,4);
});
test("calendar math handles leap days and daylight saving changes without timezone drift", () => {
  assert.equal(build([warranty("l","2028-03-01")],"2028-02-29").rows[0].daysRemaining,1);
  assert.equal(build([warranty("m","2026-03-31")],"2026-03-29").rows[0].daysRemaining,2);
  assert.equal(build([warranty("n","2026-10-25")],"2026-10-24").rows[0].daysRemaining,1);
});
test("reject invalid date, invalid horizon, duplicate warranty IDs", () => {
  assert.throws(()=>build([],"2026-02-30"),/calendar date/);
  assert.throws(()=>build([warranty("bad","2027-02-29")],"2026-10-22"),/calendar date/);
  assert.throws(()=>build([],"2026-10-22",15),/Unsupported/);
  assert.throws(()=>build([warranty("a","2026-10-22"),warranty("a","2026-10-23")],"2026-10-22"),/Duplicate/);
});
test("CSV is branch-scoped input only, escaped, and formula-safe", () => {
  const report=build([warranty("a","2026-10-22",'=HYPERLINK("evil")'),
    warranty("b","2026-10-23","+SUM(1,2)"),
    warranty("c","2026-10-24","Normal asset")],"2026-10-22");
  const csv=toCsv(report.rows);
  assert.ok(csv.startsWith('"Warranty ID","Branch ID"'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("' +SUM")===false);
  assert.ok(csv.includes("'+SUM(1,2)"));
  assert.ok(csv.includes('""evil""'));
  assert.ok(csv.includes('"customer1"'));
  assert.equal(csv.split("\r\n").filter(Boolean).length,4);
  assert.ok(!csv.includes("phone"));
});
test("shared UI mounts permitted expiry follow-up without automatic outbound messaging",()=>{
  const ui=fs.readFileSync(new URL("../../../../ui/src/components/orders/ServiceWarrantyPanel.tsx", import.meta.url),"utf8");
  assert.match(ui,/buildServiceWarrantyExpiryReport\(data\.warranties/);
  assert.match(ui,/exportServiceWarrantyExpiryCsv\(expiryReport\.rows\)/);
  assert.match(ui,/Warranty expiry follow-up/);
  assert.match(ui,/Read-only follow-up worksheet/);
});
