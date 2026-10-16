import assert from "node:assert/strict";
import fs from "node:fs";
import { parseStaffSalaryDraft } from "../staff-salary-draft.ts";

for (const [raw, expected] of [["0", 0], ["0.00", 0], ["15000", 15000], ["100.50", 100.5], [".05", 0.05], [" 250.2 ", 250.2]]) {
  assert.equal(parseStaffSalaryDraft(raw), expected, "exact salary should be preserved: " + raw);
}
for (const raw of ["", " ", "-1", "15abc", "NaN", "Infinity", "1e3", "0x10", "10.001", "1.999", "99999999999999999"]) {
  assert.throws(() => parseStaffSalaryDraft(raw), /Staff salary/, "invalid salary must not silently coerce: " + raw);
}
const page = fs.readFileSync(new URL("../../app/(app)/staff/page.tsx", import.meta.url), "utf8");
const start = page.indexOf("  function saveStaff()");
const end = page.indexOf("  const openOrders =", start);
assert.ok(start >= 0 && end > start, "staff save handler exists");
const save = page.slice(start, end);
assert.match(save, /parseStaffSalaryDraft\(form\.salary\)/);
assert.match(save, /setStaffFormError\("Staff name is required\."\)/);
assert.match(save, /if \(!phase6Store\.updateStaff\(editingId, payload\)\)/);
assert.match(save, /catch \(error\)/);
assert.doesNotMatch(save, /parseFloat\(form\.salary\) \|\| 0/);
assert.match(page, /role="alert" className="text-sm text-rose-700">\{staffFormError\}/);
console.log("Staff salary strict monetary input and save-error frontend tests PASS");
