import assert from "node:assert/strict";
import fs from "node:fs";
import { canStartServiceAssignment, canCompleteServiceAssignment } from "../order-assignment-guard.ts";

const assignment = (status) => ({ status });
const order = (status) => ({ status });
for (const status of ["pending", "processing", "ready_to_deliver", "qc", "stitching"]) {
  assert.equal(canStartServiceAssignment(assignment("assigned"), order(status)), true);
  assert.equal(canCompleteServiceAssignment(assignment("assigned"), order(status)), true);
  assert.equal(canCompleteServiceAssignment(assignment("in_progress"), order(status)), true);
}
for (const status of ["delivered", "cancelled"]) {
  assert.equal(canStartServiceAssignment(assignment("assigned"), order(status)), false);
}
assert.equal(canCompleteServiceAssignment(assignment("in_progress"), order("delivered")), true, "delivered work may be reconciled");
assert.equal(canCompleteServiceAssignment(assignment("assigned"), order("cancelled")), false);
assert.equal(canCompleteServiceAssignment(assignment("in_progress"), order("cancelled")), false);
for (const state of ["in_progress", "completed", "cancelled"]) {
  assert.equal(canStartServiceAssignment(assignment(state), order("processing")), false);
}
for (const state of ["completed", "cancelled"]) {
  assert.equal(canCompleteServiceAssignment(assignment(state), order("processing")), false, "no duplicate payouts for " + state);
}

const core = fs.readFileSync(new URL("../phase6-store.ts", import.meta.url), "utf8");
const startCode = core.slice(core.indexOf("export function startAssignment("), core.indexOf("export function completeAssignment("));
const completeCode = core.slice(core.indexOf("export function completeAssignment("), core.indexOf("export function listIncentiveRules("));
assert.match(startCode, /assertPermission\("orders\.assign"\)/);
assert.match(startCode, /canStartServiceAssignment\(assignment, order\)/);
assert.match(startCode, /assignment\.status = "in_progress"/);
assert.match(startCode, /enqueueOutbox\("staff_assignments", assignment\.id, "update"/);
assert.match(startCode, /auditAction\("service_order\.assignment\.start", "orders", order\.id/);

assert.match(completeCode, /assertPermission\("orders\.assign"\)/);
assert.match(completeCode, /if \(assignment\.status === "completed"\) return assignment;/, "idempotent completion must precede writes");
assert.match(completeCode, /canCompleteServiceAssignment\(assignment, order\)/);
assert.match(completeCode, /assignment\.status = "completed"/);
assert.match(completeCode, /assignment\.completedAt = nowISO\(\)/);
assert.match(completeCode, /enqueueOutbox\("staff_assignments", assignment\.id, "update"/);
assert.match(completeCode, /payouts\.some\(\(payout\)/, "incentive payout must stay unique");
assert.match(completeCode, /enqueueOutbox\("staff_incentive_payouts", payout\.id, "insert"/);
assert.match(completeCode, /auditAction\("service_order\.assignment\.complete", "orders", order\.id/);

const detail = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderDetail.tsx", import.meta.url), "utf8");
const servicePage = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
const staffDetail = fs.readFileSync(new URL("../../../ui/src/components/staff/StaffDetail.tsx", import.meta.url), "utf8");
const staffPage = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/staff/page.tsx", import.meta.url), "utf8");
assert.match(detail, /canAssignStaff && onStartAssignment && canStartServiceAssignment\(assignment, order\)/);
assert.match(detail, /canAssignStaff && onCompleteAssignment && canCompleteServiceAssignment\(assignment, order\)/);
assert.match(detail, /transitionStaffAssignment\(assignment, "start"\)/);
assert.match(detail, /transitionStaffAssignment\(assignment, "complete"\)/);
assert.match(detail, /role="alert" className="text-sm text-rose-700">\{staffAssignError\}/);
assert.match(servicePage, /phase6Store\.listAssignments\(\{ orderId: selected\.id \}\)/);
assert.match(servicePage, /phase6Store\.startAssignment\(assignmentId\)/);
assert.match(servicePage, /phase6Store\.completeAssignment\(assignmentId\)/);
assert.match(servicePage, /onStartAssignment=\{\(id\) => handleStaffTransition\(id, "start"\)\}/);
assert.match(servicePage, /onCompleteAssignment=\{\(id\) => handleStaffTransition\(id, "complete"\)\}/);
assert.match(staffDetail, /a\.status === "assigned" && onStartAssignment/);
assert.match(staffDetail, /\(a\.status === "assigned" \|\| a\.status === "in_progress"\) && onCompleteAssignment/);
assert.match(staffPage, /phase6Store\.startAssignment\(id\)/);
assert.match(staffPage, /phase6Store\.completeAssignment\(id\)/);
assert.match(staffPage, /actionError=\{staffActionError\}/);
console.log("Service assignment start/completion behavior and UI/ledger safety PASS");
