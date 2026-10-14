import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../apps/web/src/app/(app)/onboarding/page.tsx", import.meta.url),"utf8");
assert.match(source, /const completionPercent = steps\.length \? Math\.round/);
assert.match(source, /role="progressbar"/);
assert.match(source, /aria-valuenow=\{completionPercent\}/);
assert.match(source, /aria-label="Setup checklist progress"/);
assert.match(source, /not deployment or product readiness/);
console.log("Onboarding progress frontend contract PASS");
