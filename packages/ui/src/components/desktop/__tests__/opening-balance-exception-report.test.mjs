import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const {
  buildOpeningBalanceReviewCsv, compareOpeningBalanceReviewCsv,
  buildOpeningBalanceExceptionReportCsv,
} = require("../opening-balance-review.ts");

test("reviewed supplier exceptions export exact differences and spreadsheet-safe notes", () => {
  const parties = {
    customers: [{ id: "c1", name: "Customer", outstandingBalance: 100.5 }],
    suppliers: [{ id: "s1", name: "Supplier", outstandingBalance: -15.25 }],
  };
  const csv = buildOpeningBalanceReviewCsv(parties)
    .replace("100.50,,PENDING,", "100.50,99.50,VERIFIED,=do_not_execute")
    .replace("-15.25,,PENDING,", "-15.25,-15.25,VERIFIED,Settled");
  const reviewed = compareOpeningBalanceReviewCsv(csv, parties);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.discrepancies, 1);
  assert.equal(reviewed.matched, 1);
  assert.equal(reviewed.rows[0].notes, "=do_not_execute");
  const report = buildOpeningBalanceExceptionReportCsv(reviewed);
  assert.ok(report.startsWith("\uFEFFparty_type,party_id"));
  assert.match(report, /customer,c1,Customer,100\.50,99\.50,-1\.00,DISCREPANCY,'=do_not_execute/);
  assert.match(report, /supplier,s1,Supplier,-15\.25,-15\.25,0\.00,MATCHED,Settled/);
  assert.equal(parties.customers[0].outstandingBalance, 100.5);
});

test("pending rows retain empty financial columns, not fictional zero values", () => {
  const parties = { customers: [{ id: "c1", name: "Client", outstandingBalance: 8.2 }], suppliers: [] };
  const review = compareOpeningBalanceReviewCsv(buildOpeningBalanceReviewCsv(parties), parties);
  assert.equal(review.pending, 1);
  assert.match(buildOpeningBalanceExceptionReportCsv(review), /Client,8\.20,,,PENDING,/);
});

test("formula-like IDs and IDs starting with apostrophe remain unique after exported worksheet roundtrip", () => {
  const parties = { customers: [
    { id: "+123", name: "=HYPERLINK('bad')", outstandingBalance: 0 },
    { id: "'+123", name: "Second", outstandingBalance: 1 },
    { id: "\t=exploit", name: "Tab", outstandingBalance: 4.5 },
  ], suppliers: [] };
  const csv = buildOpeningBalanceReviewCsv(parties);
  assert.match(csv, /customer,'\+123,'=HYPERLINK/);
  assert.match(csv, /customer,''\+123,Second/);
  const review = compareOpeningBalanceReviewCsv(csv, parties);
  assert.equal(review.ok, true);
  assert.equal(review.pending, 3);
  assert.deepEqual(review.rows.map(row => row.id), ["+123", "'+123", "\t=exploit"]);
  const report = buildOpeningBalanceExceptionReportCsv(review);
  assert.match(report, /customer,''\+123,Second/);
});

test("report rejects failed/stale comparisons, partial rows and inconsistent settlement math", () => {
  const input = { customers: [{ id: "a", name: "ABC", outstandingBalance: 3.25 }], suppliers: [] };
  const worksheet = buildOpeningBalanceReviewCsv(input);
  const stale = compareOpeningBalanceReviewCsv(worksheet,
    { customers: [{ ...input.customers[0], outstandingBalance: 3.3 }], suppliers: [] });
  assert.equal(stale.ok, false);
  assert.throws(() => buildOpeningBalanceExceptionReportCsv(stale), /Unverified/);
  const review = compareOpeningBalanceReviewCsv(worksheet, input);
  assert.throws(() => buildOpeningBalanceExceptionReportCsv({ ...review, rows: [] }), /Unverified/);
  const matched = compareOpeningBalanceReviewCsv(worksheet.replace("3.25,,PENDING,", "3.25,3.25,VERIFIED,"), input);
  assert.equal(matched.matched, 1);
  assert.throws(() => buildOpeningBalanceExceptionReportCsv({
    ...matched, rows: [{ ...matched.rows[0], difference: 5 }],
  }), /inconsistent/);
});

test("quoted multiline notes and commas cannot add forged party records", () => {
  const input = { customers: [{ id: "id1", name: "Example", outstandingBalance: 4 }], suppliers: [] };
  const csv = buildOpeningBalanceReviewCsv(input).replace("4.00,,PENDING,",
    '4.00,4.00,VERIFIED,"=SUM(1,2)\r\ninjected,supplier,=2"');
  const result = compareOpeningBalanceReviewCsv(csv, input);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  const report = buildOpeningBalanceExceptionReportCsv(result);
  assert.ok(report.includes('"\'=SUM(1,2)\r\ninjected,supplier,=2"'));
});
