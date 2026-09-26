import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const numbering = require("../document-numbering.ts");

assert.equal(numbering.deriveBusinessDocumentCode("mt", "Anything"), "MT");
assert.equal(numbering.deriveBusinessDocumentCode("", "Minarva Technologies"), "MT");
assert.equal(numbering.financialYearKey(new Date("2026-03-31T12:00:00Z"), 4), "2526");
assert.equal(numbering.financialYearKey(new Date("2026-04-01T12:00:00Z"), 4), "2627");
assert.equal(
  numbering.nextBusinessDocumentNumber("invoice", [], { businessCode: "MT", date: new Date("2026-09-26T12:00:00Z") }),
  "INV-MT-2627-0001",
);
assert.equal(
  numbering.nextBusinessDocumentNumber("invoice", ["INV-MT-2627-0001", "INV-MT-2627-0012"], { businessCode: "MT", date: new Date("2026-09-26T12:00:00Z") }),
  "INV-MT-2627-0013",
);
assert.equal(
  numbering.nextBusinessDocumentNumber("quotation", ["QT-MT-2627-0009"], { businessCode: "MT", date: new Date("2026-09-26T12:00:00Z") }),
  "QT-MT-2627-0010",
);
assert.equal("INV-MT-2627-0001".length, 16);
console.log("Financial-year business document numbering PASS");
