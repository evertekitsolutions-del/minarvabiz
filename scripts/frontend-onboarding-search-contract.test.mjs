import assert from "node:assert/strict";
import fs from "node:fs";
const src=fs.readFileSync(new URL("../apps/web/src/app/(app)/onboarding/page.tsx",import.meta.url),"utf8");
assert.match(src,/type="search"/);
assert.match(src,/searchQuery\.trim\(\)\.toLowerCase\(\)/);
assert.ok(src.includes("!showIncompleteOnly || !s.done"), "Incomplete-only filtering must remain active");
assert.ok(src.includes("(loaded ? steps : []).filter"), "Pending hydration must not render preset setup cards");
console.log("Onboarding search and incomplete filter contract PASS");
