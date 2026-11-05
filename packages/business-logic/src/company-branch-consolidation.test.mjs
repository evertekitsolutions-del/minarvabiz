import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./company-branch-consolidation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { consolidatePostedAccountBalances: consolidate } =
  await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

const scope = {
  tenantId: "tenant-1", companyIds: ["company-1", "company-2"],
  branchIds: ["branch-1", "branch-2"], currency: "INR",
};
const row = (overrides = {}) => ({
  tenantId: "tenant-1", companyId: "company-1", branchId: "branch-1",
  currency: "INR", accountId: "cash", postedDebitMinor: 150, postedCreditMinor: 20,
  ...overrides,
});

test("consolidates two companies and branches using exact minor units", () => {
  assert.deepEqual(consolidate(scope, [
    row(), row({ companyId: "company-2", branchId: "branch-2", postedDebitMinor: 75, postedCreditMinor: 5 }),
  ]), [{ accountId: "cash", debitMinor: 225, creditMinor: 25, netMinor: 200 }]);
});

test("rejects cross-tenant, company, branch and currency leakage", () => {
  for (const change of [
    { tenantId: "other" }, { companyId: "other" },
    { branchId: "other" }, { currency: "USD" },
  ]) assert.throws(() => consolidate(scope, [row(change)]));
});

test("rejects duplicates, unsafe amounts, negatives and invalid scope", () => {
  assert.throws(() => consolidate(scope, [row(), row()]), /Duplicate/);
  for (const amount of [NaN, Infinity, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => consolidate(scope, [row({ postedDebitMinor: amount })]));
  assert.throws(() => consolidate({ ...scope, companyIds: [] }, []));
  assert.throws(() => consolidate({ ...scope, branchIds: ["branch-1", "branch-1"] }, []));
});

test("rejects overflow rather than returning an inaccurate total", () => {
  assert.throws(() => consolidate(scope, [
    row({ postedDebitMinor: Number.MAX_SAFE_INTEGER }),
    row({ companyId: "company-2", postedDebitMinor: 1 }),
  ]), /overflow/);
});

test("returns empty projection without inventing balances", () => {
  assert.deepEqual(consolidate(scope, []), []);
});
