import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename,
);
const csv = require("../csv-import.ts");

test("customer CSV export neutralizes formula-bearing legacy contacts without changing source records", () => {
  const rows = [{
    name: "Archived-import customer",
    phone: "=HYPERLINK(\"https://invalid.example\")",
    email: "\t@SUM(1,1)",
    address: "Main Street",
    notes: "Normal",
  }, {
    name: "Valid international",
    phone: "+919876543210",
    email: "customer@example.com",
    address: "Kerala",
    notes: "Good",
  }, {
    name: "Malicious number-like contact",
    phone: "+1234567+8",
    email: "=2+2",
    address: "Office",
    notes: "Good",
  }, {
    name: "Legacy minus prefix",
    phone: "-123456789",
    email: null,
    address: null,
    notes: null,
  }];
  const before = JSON.stringify(rows);
  const exported = csv.exportCustomersCsv(rows);
  assert.equal(JSON.stringify(rows), before, "CSV export must never mutate records");
  assert.ok(exported.includes("'=HYPERLINK"), "legacy formula phone must be inert");
  assert.ok(exported.includes("'\t@SUM(1,1)"), "legacy formula email must be inert");
  assert.ok(exported.includes("'+1234567+8"), "a second plus cannot pass as a valid international prefix");
  assert.ok(exported.includes("'-123456789"), "leading minus numeric formula must be inert");
  assert.ok(exported.includes("'=2+2"), "spreadsheet email formula must be inert");
  assert.ok(exported.includes(",+919876543210,customer@example.com,"),
    "genuine international number must remain interoperable");
});

test("supplier CSV export protects malformed legacy phone while preserving genuine international numbers", () => {
  const rows = [{
    name: "Legacy supplier",
    company: "A",
    phone: "+1234567+8",
    email: "=SUM(1,1)",
    address: null,
    category: "materials",
    notes: null,
  }, {
    name: "Genuine supplier",
    company: "B",
    phone: "+91 98765 43210",
    email: "vendor@example.com",
    address: null,
    category: "general",
    notes: null,
  }];
  const before = JSON.stringify(rows);
  const exported = csv.exportSuppliersCsv(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.ok(exported.includes("'+1234567+8"));
  assert.ok(exported.includes("'=SUM(1,1)"));
  assert.ok(exported.includes(",+91 98765 43210,vendor@example.com,"),
    "valid supplier phone should round-trip without quote-based formula escape");
});
