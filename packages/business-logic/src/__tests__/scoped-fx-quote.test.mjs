import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file,
);
const { previewScopedFxQuote } = require("../scoped-fx-quote.ts");
const base = (changes = {}) => ({
  tenantId: "tenant-1", companyId: "company-1", branchId: "branch-1",
  rateTenantId: "tenant-1", rateCompanyId: "company-1", rateBranchId: "branch-1",
  fromCurrency: "USD", toCurrency: "INR",
  rateFromCurrency: "USD", rateToCurrency: "INR",
  sourceMinor: 101, numerator: "83", denominator: "2",
  rateRevision: 2, expectedRateRevision: 2,
  effectiveAt: "2026-11-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z",
  quotedAt: "2026-11-06T00:00:00Z", ...changes,
});
test("integer rational conversion rounds half up without float drift", () => {
  const result = previewScopedFxQuote(base());
  assert.equal(result.convertedMinor, 4192);
  assert.equal(result.roundingRemainderNumerator, "1");
  assert.equal(result.roundingDenominator, "2");
});
test("reject cross-tenant, company and branch rate reuse", () => {
  for (const key of ["rateTenantId", "rateCompanyId", "rateBranchId"]) {
    assert.throws(() => previewScopedFxQuote(base({ [key]: "other" })), /scope/);
  }
});
test("reject mismatched pair and same-currency quote", () => {
  assert.throws(() => previewScopedFxQuote(base({ rateToCurrency: "EUR" })), /currency/);
  assert.throws(() => previewScopedFxQuote(base({ toCurrency: "USD", rateToCurrency: "USD" })), /currency/);
});
test("reject stale revision and expired or future rate", () => {
  assert.throws(() => previewScopedFxQuote(base({ expectedRateRevision: 1 })), /revision/);
  assert.throws(() => previewScopedFxQuote(base({ quotedAt: "2026-12-01T00:00:00Z" })), /effective/);
  assert.throws(() => previewScopedFxQuote(base({ quotedAt: "2026-10-01T00:00:00Z" })), /effective/);
});
test("reject invalid ratio, unsafe source and overflow", () => {
  assert.throws(() => previewScopedFxQuote(base({ denominator: "0" })), /ratio/);
  assert.throws(() => previewScopedFxQuote(base({ sourceMinor: 0.1 })), /amount/);
  assert.throws(() => previewScopedFxQuote(base({ sourceMinor: Number.MAX_SAFE_INTEGER, numerator: "999999999999999999" })), /overflow/);
});
test("zero is valid and input remains unchanged", () => {
  const input = Object.freeze(base({ sourceMinor: 0 }));
  assert.equal(previewScopedFxQuote(input).convertedMinor, 0);
});

test("reject impossible UTC calendar dates and preserve fractional precision", () => {
  for (const quotedAt of [
    "2026-02-30T00:00:00Z",
    "2026-11-06T24:00:00Z",
    "2026-11-06T00:00:00.9999Z",
  ]) {
    assert.throws(() => previewScopedFxQuote(base({ quotedAt })), /timestamp/);
  }
  assert.equal(previewScopedFxQuote(base({ quotedAt: "2026-11-06T00:00:00.001Z" })).convertedMinor, 4192);
  assert.equal(previewScopedFxQuote(base({ quotedAt: "2026-11-06T00:00:00.1Z" })).convertedMinor, 4192);
});
