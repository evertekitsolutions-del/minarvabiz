import assert from "node:assert/strict";
import fs from "node:fs";
const schema=fs.readFileSync(new URL("../schema/phase6.ts",import.meta.url),"utf8");
assert.match(schema,/staff_attendance/);
assert.match(schema,/staff_assignments/);
console.log("Phase 6 schema registry includes attendance PASS");
