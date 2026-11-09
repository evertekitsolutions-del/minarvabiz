import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { financialYearLabel, nextBusinessDocumentNumber } = require("../document-numbering.ts");

test("legacy Apr-Mar numbering remains unchanged", () => {
  assert.equal(financialYearLabel(new Date(2026, 2, 31)), "2025-26");
  assert.equal(financialYearLabel(new Date(2026, 3, 1)), "2026-27");
  assert.equal(nextBusinessDocumentNumber({
    kind: "INV", businessCode: "MT", date: new Date(2026, 8, 1),
    existingNumbers: ["INV-MT-2026-27-00009"],
  }), "INV-MT-2026-27-00010");
});

test("calendar-year numbering for January fiscal start", () => {
  assert.equal(financialYearLabel(new Date(2026, 0, 1), 1), "2026");
  assert.equal(nextBusinessDocumentNumber({
    kind: "QT", businessCode: "OM", fiscalYearStartMonth: 1,
    date: new Date(2026, 5, 1),
    existingNumbers: ["QT-OM-2026-00007", "QT-OM-2025-00999"],
  }), "QT-OM-2026-00008");
});

test("October-start fiscal year resets at boundary", () => {
  assert.equal(financialYearLabel(new Date(2026, 8, 30), 10), "2025-26");
  assert.equal(financialYearLabel(new Date(2026, 9, 1), 10), "2026-27");
});

test("rejects invalid fiscal configuration and document dates", () => {
  for (const month of [0, 13, 1.5, NaN, Infinity]) {
    assert.throws(() => financialYearLabel(new Date(2026, 0, 1), month));
  }
  assert.throws(() => financialYearLabel(new Date(NaN)));
  assert.throws(() => nextBusinessDocumentNumber({ kind: "BAD", existingNumbers: [] }));
});

test("ignores malformed or unsafe historical sequence suffixes", () => {
  const existingNumbers = [
    "INV-MT-2026-27-00012junk", "INV-MT-2026-27-12",
    "INV-MT-2026-27-99999999999999999999",
    "INV-MT-2026-27-00003", "INV-OTHER-2026-27-99999",
  ];
  assert.equal(nextBusinessDocumentNumber({
    kind: "INV", businessCode: "MT", date: new Date(2026, 4, 1), existingNumbers,
  }), "INV-MT-2026-27-00004");
  assert.throws(() => nextBusinessDocumentNumber({
    kind: "INV", businessCode: "MT", date: new Date(2026, 4, 1),
    existingNumbers: ["INV-MT-2026-27-9007199254740991"],
  }), /exhausted/);
});
