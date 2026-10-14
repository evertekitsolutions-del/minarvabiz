import assert from "node:assert/strict";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../apps/web/src/app/reset-password/page.tsx", import.meta.url), "utf8");
assert.match(src, /showPasswords, setShowPasswords/);
assert.equal((src.match(/type=\{showPasswords \? "text" : "password"\}/g) || []).length, 2);
assert.match(src, /checked=\{showPasswords\}/);
assert.match(src, /Show passwords/);
assert.match(src, /autoComplete="new-password"/);
console.log("Password recovery visibility frontend contract PASS");
