import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { buildBranchServiceVisitReportCsv } = require("../service-visit-export.ts");

const sample = {
  orderNumber: "SRV-001", technician: "Engineer A", plannedDate: "2026-10-25",
  siteAddress: 'Main Road, "First floor"', status: "completed",
  arrivedAt: "2026-10-25T05:00:00.000Z", completedAt: "2026-10-25T07:00:00.000Z",
  cancellationReason: null,
};

test("export preserves quoted address, UTC timestamps and UTF-8 BOM for Excel", () => {
  const csv = buildBranchServiceVisitReportCsv([sample]);
  assert.match(csv, /^\uFEFFservice_order,technician,planned_date/);
  assert.match(csv, /"Main Road, ""First floor""",completed,2026-10-25T05:00:00.000Z/);
  assert.ok(csv.endsWith("\r\n"));
});

test("formula injection and existing apostrophes are not executed in spreadsheet apps", () => {
  const csv = buildBranchServiceVisitReportCsv([{ ...sample,
    orderNumber: "=HYPERLINK(\"https://invalid\")",
    technician: "'=SUM(1,1)",
    siteAddress: "\t+2, Test",
  }]);
  assert.ok(csv.includes('"\u0027=HYPERLINK(""https://invalid"")"'));
  assert.ok(csv.includes("''=SUM(1,1)"));
  assert.ok(csv.includes('"\u0027\t+2, Test"'));
});

test("cancelled and scheduled rows keep missing arrival/completion blank", () => {
  const csv = buildBranchServiceVisitReportCsv([
    { ...sample, status: "scheduled", arrivedAt: null, completedAt: null },
    { ...sample, status: "cancelled", arrivedAt: null, completedAt: null, cancellationReason: "No access" },
  ]);
  assert.match(csv, /scheduled,,,/);
  assert.match(csv, /cancelled,,,No access/);
});

test("broken visit lifecycle, date and invalid control chars fail closed", () => {
  for (const row of [
    { ...sample, status: "completed", completedAt: null },
    { ...sample, status: "arrived", arrivedAt: null },
    { ...sample, plannedDate: "2026-02-30" },
    { ...sample, status: "other" },
    { ...sample, siteAddress: "Bad\u0001Control" },
    { ...sample, arrivedAt: "not-a-time" },
  ]) assert.throws(() => buildBranchServiceVisitReportCsv([row]));
});

test("20k bound rejects unbounded branch data, empty CSV stays valid", () => {
  assert.match(buildBranchServiceVisitReportCsv([]), /visit_status/);
  assert.throws(() => buildBranchServiceVisitReportCsv(Array(20_001).fill(sample)), /20,000/);
});
