import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { parseCommerceQuoteDraft } = require("../commerce-tier-quote-draft.ts");
const draft = (patch = {}) => ({
  productId: "sample-product", baseUnitPrice: 12, currency: "INR",
  quantity: "2.5", tierMinQuantity: "", tierUnitPrice: "", ...patch,
});

test("seller quote preview calculates exact regular selling price without mutation", () => {
  const raw = draft();
  const before = JSON.stringify(raw);
  assert.deepEqual(parseCommerceQuoteDraft(raw), {
    kind: "nonbinding_tier_price_preview",
    productId: "sample-product", currency: "INR",
    quantity: 2.5, baseUnitPrice: "12.00", unitPrice: "12.00",
    lineTotal: "30.00", appliedTierId: null,
  });
  assert.equal(JSON.stringify(raw), before, "form data must remain unchanged");
});

test("one-off quantity discount is ephemeral and rounds each quoted line to cents", () => {
  const q = parseCommerceQuoteDraft(draft({
    tierMinQuantity: "2", tierUnitPrice: "9.99",
  }));
  assert.equal(q.appliedTierId, "one-off-wholesale-preview");
  assert.equal(q.lineTotal, "24.98");
  assert.equal(q.unitPrice, "9.99");
  const below = parseCommerceQuoteDraft(draft({
    quantity: "1.5", tierMinQuantity: "2", tierUnitPrice: "9.99",
  }));
  assert.equal(below.appliedTierId, null);
  assert.equal(below.lineTotal, "18.00");
});

test("valid fractional unit quantities and whitespace-limited amounts are supported", () => {
  const q = parseCommerceQuoteDraft(draft({
    quantity: " 3.125 ", tierMinQuantity: "3.125", tierUnitPrice: " 1.01 ",
  }));
  assert.equal(q.quantity, 3.125);
  assert.equal(q.unitPrice, "1.01");
  assert.equal(q.lineTotal, "3.16");
});

test("partial or invalid tier settings fail closed", () => {
  for (const x of [
    { tierMinQuantity: "2" },
    { tierUnitPrice: "9.99" },
  ]) {
    assert.throws(() => parseCommerceQuoteDraft(draft(x)), /must be supplied together/);
  }
  for (const amount of ["1.001", "12abc", "-1", "Infinity", "1e5", ""]) {
    if (!amount) continue;
    assert.throws(() => parseCommerceQuoteDraft(draft({
      tierMinQuantity: "2", tierUnitPrice: amount,
    })), /Wholesale unit price/);
  }
  assert.throws(() => parseCommerceQuoteDraft(draft({
    tierMinQuantity: "2", tierUnitPrice: "12.01",
  })), /Tier price cannot exceed/);
});

test("invalid and overprecision quantities cannot reach domain billing", () => {
  for (const quantity of ["", "0", "-1", "Infinity", "NaN", "1e3", "1.0001", "1.1234", "99999999999999999"]) {
    assert.throws(() => parseCommerceQuoteDraft(draft({ quantity })), /Order quantity/);
  }
  for (const min of ["0", "-1", "1.0005", "1e2"]) {
    assert.throws(() => parseCommerceQuoteDraft(draft({
      tierMinQuantity: min, tierUnitPrice: "9.99",
    })), /Wholesale minimum quantity/);
  }
  assert.throws(() => parseCommerceQuoteDraft(draft({ baseUnitPrice: 1.0005 })), /Base unit price/);
  assert.throws(() => parseCommerceQuoteDraft(draft({ currency: "inr" })), /currency/);
});

test("Products page wires a visible preview calculator to shared domain without billing", () => {
  const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/products/page.tsx", import.meta.url), "utf8");
  assert.match(page, /B2B price quote preview/);
  assert.match(page, /parseCommerceQuoteDraft\(/);
  assert.match(page, /baseUnitPrice: product\.sellingPrice/);
  assert.match(page, /tierMinQuantity: quoteMinQuantity/);
  assert.match(page, /tierUnitPrice: quoteTierUnitPrice/);
  assert.match(page, /nonbinding quote preview/i);
  assert.match(page, /Calculate preview/);
});
