import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { evaluateCodShippingPrepayment: evaluate } = require("../commerce-cod-shipping-policy.ts");

const scope = { tenantId: "tenant-a", companyId: "company-a", branchId: "branch-a", currency: "INR" };
const policy = (patch = {}) => ({
  ...scope, commerceEnabled: true, codEnabled: true,
  requireCodShippingPrepayment: true, ...patch,
});
const quote = (patch = {}) => ({
  ...scope, orderId: "order-1", itemsTotalMinor: 12500, shippingMinor: 7500, ...patch,
});
const receipt = (patch = {}) => ({
  ...scope, orderId: "order-1", verified: true, settledShippingMinor: 7500, ...patch,
});

test("COD shipping prepayment is blocked until a verified, fully settled receipt exists", () => {
  assert.deepEqual(evaluate(policy(), quote(), "cod"), {
    allowed: false, reason: "shipping_prepayment_due", shippingPrepaymentDueMinor: 7500,
  });
  assert.deepEqual(evaluate(policy(), quote(), "cod", receipt({ settledShippingMinor: 3000 })), {
    allowed: false, reason: "shipping_prepayment_due", shippingPrepaymentDueMinor: 4500,
  });
  assert.deepEqual(evaluate(policy(), quote(), "cod", receipt({ verified: false })), {
    allowed: false, reason: "unverified_payment", shippingPrepaymentDueMinor: 7500,
  });
  assert.deepEqual(evaluate(policy(), quote(), "cod", receipt()), {
    allowed: true, reason: "ready", shippingPrepaymentDueMinor: 0,
  });
});

test("merchant opt-in, prepaid and zero-shipping are evaluated independently", () => {
  assert.equal(evaluate(policy({ commerceEnabled: false }), quote(), "cod").reason, "commerce_disabled");
  assert.equal(evaluate(policy({ codEnabled: false }), quote(), "cod").reason, "cod_disabled");
  assert.equal(evaluate(policy(), quote(), "prepaid").allowed, true);
  assert.equal(evaluate(policy({ requireCodShippingPrepayment: false }), quote(), "cod").allowed, true);
  assert.equal(evaluate(policy(), quote({ shippingMinor: 0 }), "cod").allowed, true);
});

test("cross-tenant, company, branch, currency and order receipts are rejected", () => {
  for (const field of ["tenantId", "companyId", "branchId", "currency", "orderId"]) {
    const changed = field === "currency" ? "OMR" : "other";
    assert.equal(evaluate(policy(), quote(), "cod", receipt({ [field]: changed })).reason,
      "scope_mismatch", field);
  }
  assert.equal(evaluate(policy({ branchId: "branch-b" }), quote(), "cod").reason, "scope_mismatch");
  assert.equal(evaluate(policy({ tenantId: "" }), quote(), "cod").reason, "scope_mismatch");
  assert.equal(evaluate(policy({ currency: "inr" }), quote(), "cod").reason, "scope_mismatch");
});

test("non-integer, negative, nonfinite and overflowing minor-unit amounts fail closed", () => {
  for (const value of [NaN, Infinity, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(evaluate(policy(), quote({ shippingMinor: value }), "cod").reason, "invalid_amount");
    assert.equal(evaluate(policy(), quote(), "cod", receipt({ settledShippingMinor: value })).reason,
      "invalid_amount");
  }
  assert.equal(evaluate(policy(), quote({ itemsTotalMinor: Number.MAX_SAFE_INTEGER }), "cod").reason,
    "invalid_amount");
  assert.equal(evaluate(policy(), quote(), "bank-transfer").reason, "invalid_amount");
});
