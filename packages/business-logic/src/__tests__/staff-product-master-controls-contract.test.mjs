import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const productList = read("packages/ui/src/components/products/ProductList.tsx");
const staffList = read("packages/ui/src/components/staff/StaffList.tsx");
const store = read("packages/business-logic/src/store.ts");
const phase6 = read("packages/business-logic/src/phase6-store.ts");
const webProducts = read("apps/web/src/app/(app)/products/page.tsx");
const webStaff = read("apps/web/src/app/(app)/staff/page.tsx");
const desktop = read("apps/desktop/src/App.tsx");

for (const token of ["Archive product", "Archive reason *", "Stock must be zero before archive", "All status"]) {
  assert.equal(productList.includes(token), true, `Missing product master control: ${token}`);
}
assert.equal(productList.includes(">Delete<"), false);
assert.equal(store.includes("export function archiveProduct"), true);
assert.equal(store.includes("Adjust product stock to zero before archiving"), true);
assert.equal(store.includes('auditAction("product.archive"'), true);
assert.equal(webProducts.includes("store.archiveProduct(product.id, reason)"), true);
assert.equal(desktop.includes("store.archiveProduct(p.id,reason)"), true);

for (const token of ["Search staff", "All roles", "All statuses", "Archive staff", "Archive reason *"]) {
  assert.equal(staffList.includes(token), true, `Missing staff master control: ${token}`);
}
assert.equal(phase6.includes("query?:string"), true);
assert.equal(phase6.includes("export function archiveStaff"), true);
assert.equal(phase6.includes("active staff assignments before archiving"), true);
assert.equal(phase6.includes('auditAction("staff.create"'), true);
assert.equal(phase6.includes('auditAction("staff.update"'), true);
assert.equal(phase6.includes('auditAction("staff.archive"'), true);
assert.equal(webStaff.includes("phase6Store.updateStaff(editingId, payload)"), true);
assert.equal(webStaff.includes("phase6Store.archiveStaff(member.id, reason)"), true);
assert.equal(desktop.includes("phase6Store.updateStaff(editingStaffId,payload)"), true);
assert.equal(desktop.includes("phase6Store.archiveStaff(m.id,reason)"), true);

console.log("Staff/product master control contract PASS");
