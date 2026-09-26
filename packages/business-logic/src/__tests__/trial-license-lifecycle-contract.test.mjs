import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const app = read("apps/desktop/src/App.tsx");
const main = read("apps/desktop/electron/main.ts");
const licenseView = read("apps/desktop/src/components/DesktopLicenseView.tsx");
const trialGate = read("packages/ui/src/components/licensing/TrialGate.tsx");

assert.equal(main.includes("30 * 86400000"), true, "Trial duration must remain 30 days");
assert.equal(main.includes('const status = daysRemaining > 0 ? "active" : "expired"'), true, "Trial must expire deterministically");
assert.equal(main.includes('status: "invalid_clock"'), true, "Clock rollback protection must remain enabled");
assert.equal(main.includes('status: "invalid_device"'), true, "Trial must stay device-bound");

assert.equal(app.includes('if(!commercialActive&&trialState.status!=="active")return <TrialGate'), true, "Expired/unactivated trial must block application access");
assert.equal(trialGate.includes("Your Minarva Biz trial has ended"), true);
assert.equal(trialGate.includes("Activate a commercial license to continue using Minarva Biz."), true);

assert.equal(app.includes("effectiveLicenseDaysRemaining(commercialLicense, trialState)"), true, "Operational alerts must include trial expiry");
assert.equal(app.includes("showLicenseDashboardNotice"), true, "Dashboard must surface trial/license notice");
assert.equal(app.includes("Manage License"), true);
assert.equal(app.includes("trialState={trialState}"), true, "License view must receive trial state");

assert.equal(licenseView.includes("30-day free trial active"), true);
assert.equal(licenseView.includes("trialState.daysRemaining"), true);
assert.equal(licenseView.includes("trialState.trialStartedAt"), true);
assert.equal(licenseView.includes("trialState.trialExpiresAt"), true);
assert.equal(licenseView.includes("business data is preserved"), true);
assert.equal(licenseView.includes('status: "trial"'), true);

console.log("Trial/license lifecycle contract PASS");
