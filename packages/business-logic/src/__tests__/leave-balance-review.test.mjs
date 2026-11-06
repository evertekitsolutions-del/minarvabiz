import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
const { reviewLeaveBalances } = require("../leave-balance-review.ts");
const scope = { tenantId: "t", companyId: "c", branchId: "b",
  employeeId: "e", canViewLeave: true };
const grant = { id: "g1", tenantId: "t", companyId: "c", branchId: "b",
  employeeId: "e", leaveTypeId: "annual", minutes: 4800,
  effectiveDate: "2026-01-01", version: 1 };
const request = { id: "r1", tenantId: "t", companyId: "c", branchId: "b",
  employeeId: "e", leaveTypeId: "annual", minutes: 480,
  from: "2026-01-10", to: "2026-01-10", status: "approved", version: 1 };
const review = (grants = [grant], requests = [request], s = scope, asOf = "2026-02-01") =>
  reviewLeaveBalances({ scope: s, grants, requests, asOf });
assert.deepEqual(review(), [{ leaveTypeId: "annual", grantedMinutes: 4800,
  approvedMinutes: 480, pendingMinutes: 0, availableMinutes: 4320, overdrawnMinutes: 0 }]);
assert.equal(review([grant], [{...request, status: "pending"}])[0].availableMinutes, 4800);
assert.equal(review([grant], [{...request, status: "pending"}])[0].pendingMinutes, 480);
assert.equal(review([grant], [{...request, status: "rejected"}])[0].approvedMinutes, 0);
assert.equal(review([grant], [{...request, status: "cancelled"}])[0].approvedMinutes, 0);
assert.equal(review([grant], [{...request, status: "draft"}])[0].approvedMinutes, 0);
assert.equal(review([grant], [{...request, minutes: 6000}])[0].overdrawnMinutes, 1200);
assert.equal(review([{...grant, effectiveDate: "2027-01-01"}], [])[0]?.grantedMinutes ?? 0, 0);
assert.deepEqual(review([], []), []);
assert.throws(() => review([grant], [request], {...scope, canViewLeave: false}), /Authorized/);
for (const field of ["tenantId", "companyId", "branchId", "employeeId"]) {
  assert.throws(() => review([{...grant, [field]: "other"}]), /scope/);
  assert.throws(() => review([grant], [{...request, [field]: "other"}]), /scope/);
}
assert.throws(() => review([grant, grant]), /Duplicate/);
assert.throws(() => review([grant], [request, request]), /Duplicate/);
assert.throws(() => review([grant], [{...request, from: "2026-01-30", to: "2026-02-02"}]), /cutoff/);
assert.throws(() => review([{...grant, effectiveDate: "2026-02-30"}]), /date/);
assert.throws(() => review([grant], [{...request, from: "2026-01-31", to: "2026-01-01"}]), /dates/);
assert.throws(() => review([grant], [{...request, minutes: -1}]), /invalid/);
assert.throws(() => review([grant], [{...request, status: "paid"}]), /status/);
assert.throws(() => review([{...grant, minutes: Number.MAX_SAFE_INTEGER},
  {...grant, id: "g2", minutes: 1}], []), /overflow/);
assert.throws(() => review([grant], [request], scope, "2026-02-30"), /cutoff/);
const grants = structuredClone([grant]), requests = structuredClone([request]);
review(grants, requests);
assert.deepEqual(grants, [grant]);
assert.deepEqual(requests, [request]);
const source = fs.readFileSync("packages/business-logic/src/leave-balance-review.ts", "utf8");
assert.doesNotMatch(source, /fetch\\(|supabase|saveLeave|postPayroll|Date\\.now\\(/);
console.log("HR-006 leave balance scope, cutoff, approval, overflow, immutability PASS");
