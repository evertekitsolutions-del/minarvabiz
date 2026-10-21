import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, file,
);
const { planAmcVisits } = require("../amc-visit-planner.ts");
const base = {
  customerId: "c1",
  customerName: "CCTV Customer",
  contractReference: "AMC-001",
  startDate: "2026-01-31",
  endDate: "2026-05-31",
  intervalMonths: 1,
  notes: "Inspect DVR, cameras and UPS",
};

test("monthly visits anchor to contract date even across shorter months", () => {
  const original = JSON.stringify(base);
  const plan = planAmcVisits(base);
  assert.deepEqual(plan.visits.map(v => v.visitDate), [
    "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
  ]);
  assert.deepEqual(plan.visits.map(v => v.sequence), [1, 2, 3, 4, 5]);
  assert.equal(plan.intervalMonths, 1);
  assert.equal(JSON.stringify(base), original);
});

test("leap-day annual recurrence clamps and returns to Feb 29 when leap year repeats", () => {
  const p = planAmcVisits({ ...base,
    startDate: "2024-02-29", endDate: "2028-02-29", intervalMonths: 12,
  });
  assert.deepEqual(p.visits.map(v => v.visitDate), [
    "2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29",
  ]);
});

test("quarterly plan includes only in-contract local dates", () => {
  const p = planAmcVisits({ ...base, startDate: "2026-10-21", endDate: "2027-07-20", intervalMonths: 3 });
  assert.deepEqual(p.visits.map(v => v.visitDate), ["2026-10-21","2027-01-21","2027-04-21"]);
});

test("malformed dates, overlong contracts, invalid intervals and missing identity fail closed", () => {
  for (const endDate of ["2026-02-30", "2025-01-01", "2032-01-31", "2026/05/31", "2000-13-01"]) {
    assert.throws(() => planAmcVisits({ ...base, endDate }));
  }
  for (const intervalMonths of [0, 4, 13, 1.5, NaN]) {
    assert.throws(() => planAmcVisits({ ...base, intervalMonths }));
  }
  assert.throws(() => planAmcVisits({ ...base, customerId: "" }), /required/);
  assert.throws(() => planAmcVisits({ ...base, contractReference: " " }), /required/);
  assert.throws(() => planAmcVisits({ ...base, notes: "x".repeat(2001) }), /length/);
});

test("five-year monthly contract is bounded and deterministic", () => {
  const input = { ...base, startDate:"2026-01-01", endDate:"2031-01-01" };
  const p1 = planAmcVisits(input);
  assert.equal(p1.visits.length, 61);
  assert.equal(p1.visits[60].visitDate, "2031-01-01");
  assert.deepEqual(planAmcVisits(input), p1);
});

test("CSV neutralizes formulas, escapes commas, quotes and newlines", () => {
  const p = planAmcVisits({ ...base,
    customerName: '=HYPERLINK("malicious")',
    contractReference: "@query",
    notes: 'Inspect, camera\n"server"',
  });
  assert.match(p.csv, /"'@query"/);
  assert.match(p.csv, /"'=HYPERLINK\(""malicious""\)"/);
  assert.match(p.csv, /"Inspect, camera\n""server"""/);
  assert.equal((p.csv.match(/\r\n/g) || []).length, p.visits.length + 1);
});

test("shared Services UI exposes manual visit planning and export without automatic dispatch", () => {
  const text = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderList.tsx", import.meta.url), "utf8");
  assert.match(text, /Plan AMC visits/);
  assert.match(text, /planAmcVisits/);
  assert.match(text, /Export AMC schedule CSV/);
  assert.doesNotMatch(text, /commitAmcContract\(/);
});
