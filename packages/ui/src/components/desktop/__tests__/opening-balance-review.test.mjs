import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { buildOpeningBalanceReviewCsv } = require("../opening-balance-review.ts");

test("one read-only review worksheet covers customer and supplier balances with blank verified fields", () => {
  const input = {
    customers: [{ id: "c-1", name: "Customer A", outstandingBalance: 120.50 }],
    suppliers: [{ id: "s-1", name: "Supplier B", outstandingBalance: -15.25 }],
  };
  const before = structuredClone(input);
  const csv = buildOpeningBalanceReviewCsv(input);
  assert.equal(csv, "\uFEFFparty_type,party_id,party_name,current_outstanding,verified_outstanding,review_status,review_notes\r\n" +
    "customer,c-1,Customer A,120.50,,PENDING,\r\n" +
    "supplier,s-1,Supplier B,-15.25,,PENDING,\r\n");
  assert.deepEqual(input, before);
});

test("escaped party labels prevent CSV injection and preserve embedded quotes/newlines", () => {
  const csv = buildOpeningBalanceReviewCsv({
    customers: [
      { id: "=1+1", name: 'Acme, "Group"\nNorth', outstandingBalance: 0 },
      { id: "normal", name: "  @HYPERLINK(1)", outstandingBalance: 0.1 + 0.2 },
    ],
    suppliers: [],
  });
  assert.match(csv, /customer,'=1\+1,"Acme, ""Group""\nNorth",0\.00,,PENDING,/);
  assert.match(csv, /normal,'  @HYPERLINK\(1\),0\.30,,PENDING,/);
});

test("invalid ledger precision or nonfinite balances cannot produce a misleading export", () => {
  for (const amount of [NaN, Infinity, 1.001, Number.MAX_VALUE, -0.001]) {
    assert.throws(() => buildOpeningBalanceReviewCsv({
      customers: [{ id: "c", name: "Customer", outstandingBalance: amount }],
      suppliers: [],
    }));
  }
});

test("worksheet refuses parties without stable IDs and unbounded input sizes", () => {
  assert.throws(() => buildOpeningBalanceReviewCsv({
    customers: [{ id: " ", name: "Unknown", outstandingBalance: 0 }],
    suppliers: [],
  }), /stable identity/);
  const oversized = Array(50_001).fill({ id: "x", name: "X", outstandingBalance: 0 });
  assert.throws(() => buildOpeningBalanceReviewCsv({ customers: oversized, suppliers: [] }), /50,000/);
});
