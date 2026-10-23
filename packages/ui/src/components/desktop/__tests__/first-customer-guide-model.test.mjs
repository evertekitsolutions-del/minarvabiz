import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { firstCustomerEvidence, firstCustomerReviewCounts, firstCustomerRoutes } = require("../first-customer-guide-model.ts");

const signals = {
  shopName: "Minarva Biz", shopPhone: "", shopAddress: "",
  products: 0, customers: 0, suppliers: 0,
  licenseStatus: "trial", verifiedNativeBackups: null,
};

test("first-customer guide covers exactly the durable onboarding IDs and real module routes", () => {
  assert.deepEqual(Object.keys(firstCustomerRoutes), ["shop", "products", "customers", "customer-balances", "suppliers", "license", "backup"]);
  assert.equal(firstCustomerRoutes.suppliers.href, "/suppliers");
  assert.equal(firstCustomerRoutes["customer-balances"].href, "/customers");
});

test("a default shop, trial-only device or unknown backup cannot be treated as evidence", () => {
  assert.equal(firstCustomerEvidence("shop", signals).observed, false);
  assert.equal(firstCustomerEvidence("license", signals).observed, false);
  assert.equal(firstCustomerEvidence("backup", signals).observed, false);
  assert.equal(firstCustomerEvidence("backup", signals).requiresEvidence, true);
  assert.equal(firstCustomerReviewCounts(Object.keys(firstCustomerRoutes).map(id => ({ id, done: true })), signals).evidenceSupported, 2);
});

test("valid live records and verified native backup support operator confirmations without claiming UAT", () => {
  const ready = { ...signals, shopName: "First Shop", shopPhone: "5551234567", products: 2, customers: 1, suppliers: 0, licenseStatus: "grace", verifiedNativeBackups: 1 };
  const steps = Object.keys(firstCustomerRoutes).map(id => ({ id, done: true }));
  assert.deepEqual(firstCustomerReviewCounts(steps, ready), { reviewed: 7, evidenceSupported: 7, total: 7 });
  assert.equal(firstCustomerEvidence("suppliers", ready).requiresEvidence, false); // service-only shop with no vendors
  assert.equal(firstCustomerEvidence("backup", { ...ready, verifiedNativeBackups: 0 }).observed, false);
  assert.equal(firstCustomerEvidence("license", { ...ready, licenseStatus: "expired" }).observed, false);
});

test("manual confirmations never falsely create evidence for missing business records", () => {
  const steps = [{ id: "shop", done: true }, { id: "backup", done: true }, { id: "license", done: false }, { id: "unknown", done: true }];
  assert.deepEqual(firstCustomerReviewCounts(steps, signals), { reviewed: 2, evidenceSupported: 0, total: 7 });
});
