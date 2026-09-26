import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const { financialYearLabel, deriveBusinessDocumentCode, nextBusinessDocumentNumber } = require("../document-numbering.ts");

assert.equal(financialYearLabel(new Date("2026-04-01T00:00:00Z")), "2026-27");
assert.equal(financialYearLabel(new Date("2026-03-31T12:00:00Z")), "2025-26");
assert.equal(deriveBusinessDocumentCode("Minarva Technologies"), "MT");
assert.equal(deriveBusinessDocumentCode("Example Private Limited"), "EXAMPLE");

const existing = [
  "INV-MT-2026-27-00001",
  "INV-MT-2026-27-00009",
  "INV-MT-2025-26-99999",
  "QT-MT-2026-27-00012",
];
assert.equal(nextBusinessDocumentNumber({
  kind: "INV", existingNumbers: existing, businessCode: "MT", date: new Date("2026-09-26T00:00:00Z"),
}), "INV-MT-2026-27-00010");
assert.equal(nextBusinessDocumentNumber({
  kind: "QT", existingNumbers: existing, businessName: "Minarva Technologies", date: new Date("2026-09-26T00:00:00Z"),
}), "QT-MT-2026-27-00013");

console.log("Document numbering: company code + Indian financial year + persisted sequence PASS");
