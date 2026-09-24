import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  activeActivationCount,
  canIssueLicense,
  canManageLicenseStatus,
  customerNameForLicense,
  defaultFeatures,
  enabledFeatureLabels,
} from "../apps/license-admin/src/app/admin-panel/model.ts";

const panelPath = new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url);
const componentPaths = [
  "../apps/license-admin/src/app/admin-panel/AdminAuthCard.tsx",
  "../apps/license-admin/src/app/admin-panel/LicenseCreateCard.tsx",
  "../apps/license-admin/src/app/admin-panel/LicenseSummaryCard.tsx",
  "../apps/license-admin/src/app/admin-panel/OfflineActivationCard.tsx",
  "../apps/license-admin/src/app/admin-panel/LicenseRegistryCard.tsx",
  "../apps/license-admin/src/app/admin-panel/types.ts",
];

const panel = await readFile(panelPath, "utf8");
const components = [];
for (const relativePath of componentPaths) {
  components.push(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}
const combined = [panel, ...components].join("\n");

assert.ok(panel.length < 10_000, "AdminPanel should remain a thin orchestrator");
assert.match(panel, /AdminAuthCard/);
assert.match(panel, /LicenseCreateCard/);
assert.match(panel, /OfflineActivationCard/);
assert.match(panel, /LicenseRegistryCard/);
assert.match(panel, /LicenseSummaryCard/);
assert.doesNotMatch(combined, /type\s+LicenseRow\s*=\s*any/);
assert.doesNotMatch(combined, /\([^)]*:\s*any\b/);
assert.doesNotMatch(
  components.slice(0, 5).join("\n"),
  /from\s+["'][^"']*actions["']/,
  "Extracted presentation components must not call server actions directly",
);

const basic = defaultFeatures("basic");
assert.equal(basic.sales, true);
assert.equal(basic.customers, true);
assert.equal(basic.inventory, true);
assert.equal(basic.tailoring, false);

const enterprise = defaultFeatures("enterprise");
assert.equal(Object.values(enterprise).every(Boolean), true);

assert.equal(canIssueLicense("viewer"), false);
assert.equal(canIssueLicense("operator"), true);
assert.equal(canIssueLicense("admin"), true);
assert.equal(canManageLicenseStatus("viewer"), false);
assert.equal(canManageLicenseStatus("operator"), false);
assert.equal(canManageLicenseStatus("admin"), true);

const sampleLicense = {
  id: "db-license-id",
  license_id: "LIC-123",
  plan: "professional",
  edition: "hybrid",
  status: "active",
  activation_limit: 3,
  metadata: { customerName: " Example Customer " },
  features: { sales: true, inventory: true, apiAccess: false },
  activations: [
    { status: "active" },
    { status: "deactivated" },
    { status: "active" },
  ],
};
assert.equal(activeActivationCount(sampleLicense), 2);
assert.equal(customerNameForLicense(sampleLicense), "Example Customer");
assert.deepEqual(enabledFeatureLabels(sampleLicense).sort(), ["Billing / Sales", "Inventory"].sort());

console.log("License-admin modular UI smoke PASS");
