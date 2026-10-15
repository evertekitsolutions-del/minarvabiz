import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./windows-populated-deep-smoke.mjs", import.meta.url), "utf8");
assert.match(source, /async function assertMainEventually\(/);
assert.match(source, /Date\.now\(\) \+ timeoutMs/);
assert.match(source, /await sleep\(300\)/);
assert.match(source, /throw new Error\(name \+ " marker missing after "/);
assert.match(source, /await assertMainEventually\(ws,"ATTENDANCE_WORKED_TIME",\["510m","45m"\]\)/);
assert.doesNotMatch(source, /await assertMain\(ws,"ATTENDANCE_WORKED_TIME"/);
console.log("Windows attendance completion poll retains fail-closed timeout PASS");
