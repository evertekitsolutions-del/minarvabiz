import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../apps/web/src/app/(app)/onboarding/page.tsx",import.meta.url),"utf8");
assert.match(source,/showIncompleteOnly/);
assert.ok(source.includes("!showIncompleteOnly || !s.done"), "Incomplete filtering must remain in computed visible steps");
assert.match(source,/Show incomplete steps only/);
assert.match(source,/All checklist steps have been confirmed/);
console.log("Onboarding incomplete filter contract PASS");
