import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const phase6 = require("../phase6-store.ts");
const store = require("../store.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const staffFixture = {
  id: "staff-master-1", name: "Asha Tailor", phone: "9999999999", email: "asha@example.com",
  role: "tailor", salary: 18000, joiningDate: "2026-01-01", status: "active", notes: "Lead",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null,
};
phase6.hydratePhase6({
  staff: [staffFixture],
  assignments: [{ id: "asg-1", staffId: staffFixture.id, staffName: staffFixture.name, orderId: "ord-1", orderNumber: "ORD-1", assignedAt: "2026-09-01T00:00:00.000Z", status: "in_progress", notes: null }],
  incentiveRules: [], payouts: [], notifications: [],
});
assert.equal(phase6.listStaff({ query: "asha" }).length, 1);
assert.equal(phase6.listStaff({ query: "example.com" }).length, 1);
assert.match(phase6.archiveStaff(staffFixture.id, "").error, /reason is required/i);
assert.match(phase6.archiveStaff(staffFixture.id, "Left company").error, /active staff assignments/i);

phase6.hydratePhase6({ assignments: [{ id: "asg-1", staffId: staffFixture.id, staffName: staffFixture.name, orderId: "ord-1", orderNumber: "ORD-1", assignedAt: "2026-09-01T00:00:00.000Z", completedAt: "2026-09-02T00:00:00.000Z", status: "completed", notes: null }] });
const updatedStaff = phase6.updateStaff(staffFixture.id, { name: "Asha Senior", salary: 20000, status: "inactive" });
assert.equal(updatedStaff.name, "Asha Senior");
assert.equal(updatedStaff.salary, 20000);
const archivedStaff = phase6.archiveStaff(staffFixture.id, "Employment ended");
assert.ok(archivedStaff.staff?.deletedAt);
assert.equal(phase6.listStaff().length, 0);

const productFixture = {
  id: "prod-master-1", name: "Archive Guard Product", sku: "AG-1", barcode: null, categoryId: null,
  brand: null, size: null, color: null, fabric: null, parentProductId: null, hasVariants: false,
  unit: "pcs", costPrice: 10, sellingPrice: 20, discount: 0, taxRate: 0, stockQuantity: 2,
  minimumStock: 1, supplierId: null, imageUrl: null, notes: null, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null, version: 1,
};
store.hydrateCore({ customers: [], products: [productFixture], sales: [], payments: [] });
assert.match(store.archiveProduct(productFixture.id, "").error, /reason is required/i);
assert.match(store.archiveProduct(productFixture.id, "Discontinued").error, /stock to zero/i);
store.adjustStock(productFixture.id, "adjustment", -2, "Clear stock before archive");
const archivedProduct = store.archiveProduct(productFixture.id, "Discontinued");
assert.ok(archivedProduct.product?.deletedAt);
assert.equal(archivedProduct.product?.isActive, false);
assert.equal(store.listProducts().length, 0);

console.log("Staff/product master control runtime PASS");
