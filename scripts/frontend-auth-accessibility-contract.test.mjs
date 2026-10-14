import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(new URL("../apps/web/src/app/" + path, import.meta.url), "utf8");
for (const path of ["login/page.tsx", "forgot-password/page.tsx", "reset-password/page.tsx"]) {
 const source=read(path);
 assert.match(source, /role="alert"/, path + " should announce error messages to screen readers");
 assert.match(source, /role="status"/, path + " should announce success or loading state to screen readers");
 assert.match(source, /autoComplete="/, path + " should provide credential autofill semantics");
}
assert.match(read("login/page.tsx"), /autoComplete="current-password"/);
assert.match(read("login/page.tsx"), /autoComplete="name"/);
console.log("Authentication frontend accessibility contract PASS");
