import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(new URL("../apps/web/src/app/" + path, import.meta.url), "utf8");
for (const path of ["login/page.tsx", "forgot-password/page.tsx", "reset-password/page.tsx"]) {
 const source=read(path);
 assert.match(source, /role="alert"/, path + " should announce error messages to screen readers");
 assert.match(source, /role="status"/, path + " should announce success or loading state to screen readers");
 assert.match(source, /autoComplete="/, path + " should provide credential autofill semantics");
}
assert.match(read("login/page.tsx"), /autoComplete=\{setup \? "new-password" : "current-password"\}/);
assert.match(read("login/page.tsx"), /autoComplete="name"/);
assert.match(read("login/page.tsx"), /aria-pressed=\{showPassword\}/);
assert.match(read("login/page.tsx"), /type="button" aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
for (const path of ["forgot-password/page.tsx", "reset-password/page.tsx"]) {
 const source = read(path);
 assert.match(source, /catch\s*\{/, path + " must display a recoverable network failure");
 assert.match(source, /finally\s*\{\s*setLoading\(false\)/, path + " must reset loading even when request throws");
}
console.log("Authentication frontend accessibility contract PASS");
