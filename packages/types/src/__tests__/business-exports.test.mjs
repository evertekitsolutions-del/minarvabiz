import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BUSINESS_PRESETS, getBusinessPresetById, parseBusinessGroup, resolveBusinessUIProfile,
} from "../index.ts";

assert.equal(BUSINESS_PRESETS.length, 100);
assert.equal(getBusinessPresetById("054")?.code, "serialized_054");
assert.equal(parseBusinessGroup("SERVICE"), "SERVICE");
const result = resolveBusinessUIProfile({
  verifiedOrgId: "tenant-a", orgRecord: { id: "tenant-a" },
  allowedByLicense: [], allowedByRole: [],
});
assert.deepEqual(result, { mode: "legacy", orgId: "tenant-a", businessGroup: null, enabledCapabilities: [] });
const webSales = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/sales/page.tsx", import.meta.url), "utf8");
const pos = fs.readFileSync(new URL("../../../ui/src/components/sales/PosBilling.tsx", import.meta.url), "utf8");
assert.doesNotMatch(webSales, /resolveBusinessUIProfile\(/, "No untrusted checkout routing yet");
assert.doesNotMatch(pos, /resolveBusinessUIProfile\(/, "No untrusted billing authority yet");
console.log("PASS UBP-01 barrel exports and untouched checkout boundary");
