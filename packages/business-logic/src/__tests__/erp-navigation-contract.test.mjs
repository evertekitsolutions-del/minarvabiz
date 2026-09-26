import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const nav = read("packages/ui/src/lib/nav.ts");
const sidebar = read("packages/ui/src/components/layout/Sidebar.tsx");
const webLayout = read("apps/web/src/components/AppLayoutClient.tsx");
const rootPkg = JSON.parse(read("package.json"));
const desktopPkg = JSON.parse(read("apps/desktop/package.json"));
const webSmoke = read("scripts/web-ui-deep-smoke.mjs");
const windowsInstalledSmoke = read("scripts/windows-installed-deep-smoke.mjs");
const windowsPopulatedSmoke = read("scripts/windows-populated-deep-smoke.mjs");

for (const section of [
  "Sales & Operations",
  "Inventory & Procurement",
  "Finance & Reporting",
  "Team & Communication",
  "Administration",
]) {
  assert.equal(nav.includes(section), true, `Missing ERP nav section: ${section}`);
}

const mainNavBlock = nav.slice(nav.indexOf("export const MAIN_NAV"), nav.indexOf("export const DETAIL_NAV"));
assert.equal(mainNavBlock.includes('id: "customer-crm"'), false);
assert.equal(mainNavBlock.includes('id: "staff-detail"'), false);
assert.equal(nav.includes('"customer-crm": "customers"'), true);
assert.equal(nav.includes('"staff-detail": "staff"'), true);

const expectedOrder = [
  'id: "dashboard"', 'id: "sales"', 'id: "quotations"', 'id: "returns"', 'id: "customers"',
  'id: "services"', 'id: "laundry"', 'id: "products"', 'id: "warehouse"', 'id: "purchases"',
  'id: "suppliers"', 'id: "payments"', 'id: "expenses"', 'id: "accounting"', 'id: "day-end"',
  'id: "reports"', 'id: "staff"', 'id: "notifications"', 'id: "audit"', 'id: "settings"',
  'id: "backup"', 'id: "license"',
];
let previous = -1;
for (const token of expectedOrder) {
  const index = mainNavBlock.indexOf(token);
  assert.ok(index > previous, `ERP navigation order regression at ${token}`);
  previous = index;
}

assert.equal(sidebar.includes("NAV_SECTIONS"), true);
assert.equal(sidebar.includes("sidebarActiveNavId"), true);
assert.equal(sidebar.includes("aria-expanded={expanded}"), true);
assert.equal(sidebar.includes('w-[264px]'), true);
assert.equal(webSmoke.includes("aside button[aria-expanded]"), true);
assert.equal(windowsInstalledSmoke.includes("aside button[aria-expanded]"), true);
assert.equal(windowsPopulatedSmoke.includes("aside button[aria-expanded]"), true);
assert.equal(windowsInstalledSmoke.includes("STAFF_DETAILS"), false);

for (const mapping of [
  '"/quotations": "quotations"',
  '"/license": "license"',
  '"/inventory": "products"',
  '"/variants": "products"',
  '"/cash-register": "payments"',
  '"/stock-take": "warehouse"',
]) {
  assert.equal(webLayout.includes(mapping), true, `Missing path-to-nav mapping: ${mapping}`);
}

assert.equal(rootPkg.version, "1.0.8");
assert.equal(desktopPkg.version, rootPkg.version);

console.log("Professional ERP navigation contract PASS");
