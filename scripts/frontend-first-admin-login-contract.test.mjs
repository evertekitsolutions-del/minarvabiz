import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../apps/web/src/app/login/page.tsx", import.meta.url), "utf8");
assert.match(source, /const signedIn = await login\(email, password\)/);
assert.match(source, /!signedIn\.session \|\| !signedIn\.user/);
assert.match(source, /setSession\(signedIn\.session\.token/);
assert.doesNotMatch(source, /session!\.token/);
console.log("First administrator sign-in failure contract PASS");
