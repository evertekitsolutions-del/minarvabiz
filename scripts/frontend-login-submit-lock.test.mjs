import assert from "node:assert/strict";
import fs from "node:fs";
const src=fs.readFileSync(new URL("../apps/web/src/app/login/page.tsx",import.meta.url),"utf8");
assert.match(src,/submitInFlight = React\.useRef\(false\)/);
assert.match(src,/if \(submitInFlight\.current\) return/);
assert.match(src,/submitInFlight\.current = true/);
assert.match(src,/finally \{\s*submitInFlight\.current = false/);
console.log("Login concurrent submission guard PASS");
