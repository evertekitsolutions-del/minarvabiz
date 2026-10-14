import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../apps/web/src/app/(app)/notifications/page.tsx",import.meta.url),"utf8");
assert.match(source,/notification\.read/);
assert.match(source,/onClick=\{refresh\}/);
assert.match(source,/role="status" aria-live="polite"/);
assert.match(source,/onMarkRead=/);
assert.match(source,/onMarkAllRead=/);
console.log("Notification page frontend contract PASS");
