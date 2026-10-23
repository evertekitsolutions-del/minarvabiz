import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { buildOpeningBalanceReviewCsv, compareOpeningBalanceReviewCsv } = require("../opening-balance-review.ts");
const current = {
  customers: [
    { id: "c1", name: 'Acme, "North"\nOffice', outstandingBalance: 120.50 },
    { id: "c2", name: "Customer B", outstandingBalance: 0 },
  ],
  suppliers: [{ id: "s1", name: "Supplier X", outstandingBalance: -15.25 }],
};

test("exported blank review worksheet is always pending, not automatically accepted", () => {
  const result = compareOpeningBalanceReviewCsv(buildOpeningBalanceReviewCsv(current), current);
  assert.deepEqual({ ok: result.ok, total: result.total, matched: result.matched,
    discrepancies: result.discrepancies, pending: result.pending },
    { ok: true, total: 3, matched: 0, discrepancies: 0, pending: 3 });
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].name, 'Acme, "North"\nOffice');
});

test("exact numeric confirmation matches, including negative supplier credits", () => {
  const input = { customers: [{ id: "c1", name: "Client", outstandingBalance: 120.5 }],
    suppliers: [{ id: "s1", name: "Supplier", outstandingBalance: -15.25 }] };
  const csv = buildOpeningBalanceReviewCsv(input)
    .replace("120.50,,PENDING,", "120.50,120.50,VERIFIED,")
    .replace("-15.25,,PENDING,", "-15.25,-15.25,VERIFIED,");
  const result = compareOpeningBalanceReviewCsv(csv, input);
  assert.equal(result.ok, true);
  assert.equal(result.matched, 2);
  assert.equal(result.discrepancies, 0);
  assert.equal(result.pending, 0);
});

test("verified differences are surfaced without mutating any account", () => {
  const input = structuredClone(current);
  const snapshot = structuredClone(input);
  const csv = buildOpeningBalanceReviewCsv(input)
    .replace("supplier,s1,Supplier X,-15.25,,PENDING,", "supplier,s1,Supplier X,-15.25,-20.25,VERIFIED,");
  const result = compareOpeningBalanceReviewCsv(csv, input);
  assert.equal(result.ok, true);
  assert.equal(result.discrepancies, 1);
  assert.equal(result.rows.find(row => row.id === "s1").difference, -5);
  assert.deepEqual(input, snapshot);
});

test("stale edited exported amount, duplicate and unknown party never pass", () => {
  const base = buildOpeningBalanceReviewCsv(current);
  const stale = compareOpeningBalanceReviewCsv(base.replace("-15.25,,PENDING,", "0.00,,PENDING,"), current);
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join("; "), /stale or edited/);
  const duplicate = compareOpeningBalanceReviewCsv(base.replace(
    "supplier,s1,Supplier X,-15.25,,PENDING,",
    "supplier,s1,Supplier X,-15.25,,PENDING,\r\nsupplier,s1,Supplier X,-15.25,,PENDING,",
  ), current);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join("; "), /duplicates a party/);
  const foreign = compareOpeningBalanceReviewCsv(base.replace("supplier,s1", "supplier,s-foreign"), current);
  assert.equal(foreign.ok, false);
  assert.match(foreign.errors.join("; "), /unknown party identity/);
});

test("missing parties, invalid amounts, malformed CSV, changed header and unapproved statuses fail closed", () => {
  const base = buildOpeningBalanceReviewCsv(current);
  for (const csv of [
    base.replace("supplier,s1,Supplier X,-15.25,,PENDING,\r\n", ""),
    base.replace("-15.25,,PENDING,", "-15.25,=1+1,VERIFIED,"),
    base.replace("PENDING", "OKAY"),
    base.replace("party_type", "type"),
    base.replace('Acme, ""North""', 'Acme, "North"'),
    base.replace("supplier,s1,Supplier X,-15.25,,PENDING,", "supplier,s1,Supplier X,-15.25,1.001,VERIFIED,"),
  ]) {
    const result = compareOpeningBalanceReviewCsv(csv, current);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length);
  }
});

test("verified decimal arithmetic does not accept exponent, positive sign, overflow or half-cent", () => {
  const input = { customers: [], suppliers: [{ id: "s", name: "Supplier", outstandingBalance: 0.3 }] };
  for (const raw of ["1e3", "+1", "1.001", "999999999999999999", "NaN", "=1+1"]) {
    const csv = buildOpeningBalanceReviewCsv(input).replace("0.30,,PENDING,", "0.30,"+raw+",VERIFIED,");
    assert.equal(compareOpeningBalanceReviewCsv(csv, input).ok, false, raw);
  }
});