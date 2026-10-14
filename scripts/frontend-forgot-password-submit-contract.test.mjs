import assert from "node:assert/strict";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../apps/web/src/app/forgot-password/page.tsx", import.meta.url), "utf8");
assert.match(src, /submittedEmail, setSubmittedEmail/);
assert.match(src, /if \(loading \|\| \(submittedEmail !== null/);
assert.match(src, /setSubmittedEmail\(email\.trim\(\)\.toLowerCase\(\)\)/);
assert.match(src, /disabled=\{loading \|\| \(submittedEmail !== null/);
console.log("Forgot-password duplicate request guard PASS");
