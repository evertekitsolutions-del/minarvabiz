import assert from "node:assert/strict";
import fs from "node:fs";
const src=fs.readFileSync(new URL("../apps/web/src/app/(app)/onboarding/page.tsx",import.meta.url),"utf8");
assert.match(src,/type="search"/);
assert.match(src,/searchQuery\.trim\(\)\.toLowerCase\(\)/);
assert.match(src,/!showIncompleteOnly \|\| !s\.done/);
console.log("Onboarding search and incomplete filter contract PASS");
