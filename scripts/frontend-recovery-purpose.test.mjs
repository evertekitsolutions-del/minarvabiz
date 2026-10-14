import assert from "node:assert/strict";
import fs from "node:fs";
import { isRecoveryPurpose } from "../apps/web/src/lib/recovery-purpose.ts";

for (const [hashType, queryType] of [
  [null, null], ["recovery", null], [null, "recovery"], ["recovery", "recovery"],
]) {
  assert.equal(isRecoveryPurpose(hashType, queryType), true);
}
for (const [hashType, queryType] of [
  ["signup", null], [null, "invite"], ["magiclink", "recovery"],
  ["recovery", "signup"], ["", null], ["bearer", null],
]) {
  assert.equal(isRecoveryPurpose(hashType, queryType), false);
}
const source = fs.readFileSync(new URL("../apps/web/src/app/reset-password/page.tsx", import.meta.url), "utf8");
assert.match(source, /isRecoveryPurpose\(hash\.get\("type"\), query\.get\("type"\)\)/);
assert.match(source, /"token_type"/);
assert.match(source, /window\.history\.replaceState\(null, "", sanitized\)/);
assert.match(source, /return allowedPurpose \? token : ""/);
console.log("Recovery token purpose and URL hygiene tests PASS");
