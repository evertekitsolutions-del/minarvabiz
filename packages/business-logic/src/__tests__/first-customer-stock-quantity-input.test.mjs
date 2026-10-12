import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  path,
);
const { parseNonNegativeStockQuantity } = require("../inventory.ts");
const web = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
const desktop = fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx", import.meta.url), "utf8");
const validation = fs.readFileSync(new URL("../../../validation/src/index.ts", import.meta.url), "utf8");

test("shared quantity parser retains fractional inventory to 3 decimal places", () => {
  assert.equal(parseNonNegativeStockQuantity("2.75"), 2.75);
  assert.equal(parseNonNegativeStockQuantity("0.125"), 0.125);
  assert.equal(parseNonNegativeStockQuantity("0"), 0);
  assert.equal(parseNonNegativeStockQuantity(" 12.5 "), 12.5);
});
test("shared parser rejects blank, truncation, exponent, negatives and unsafe inputs", () => {
  for (const input of ["", "  ", "-1", "2foo", "1e3", "2.7509", "NaN", "Infinity", "0x10", "9007199254740991", "1.", ".5"]) {
    assert.throws(() => parseNonNegativeStockQuantity(input), /stock quantity/i, input);
  }
});
test("web and Windows use the same parser and safe target adjustment", () => {
  for (const [platform, content, prefix] of [["web", web, "form"], ["desktop", desktop, "productForm"]]) {
    assert.match(content, new RegExp("parseNonNegativeStockQuantity\\("+prefix+"\\.stockQuantity\\)"), platform+" opening stock");
    assert.match(content, new RegExp("parseNonNegativeStockQuantity\\("+prefix+"\\.minimumStock\\)"), platform+" low-stock threshold");
    assert.match(content, /store\.adjustStockToQuantity\(/, platform+" safe target correction");
  }
  assert.match(validation, /stockQuantity:\s*stockQuantitySchema/, "Zod product schema must accept safe decimal stock");
  assert.match(validation, /minimumStock:\s*stockQuantitySchema/, "Zod minimum stock must match shared quantity precision");
});
