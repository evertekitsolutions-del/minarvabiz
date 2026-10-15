import assert from "node:assert/strict";
import fs from "node:fs";
import { canAssignServiceOrder } from "../order-assignment-guard.ts";

for (const status of ["pending", "received", "cutting", "stitching", "alteration", "qc", "processing", "ready_to_deliver"]) {
  assert.equal(canAssignServiceOrder({ status }), true, "open service orders allow staff assignments: " + status);
}
for (const status of ["delivered", "cancelled"]) {
  assert.equal(canAssignServiceOrder({ status }), false, "closed service orders cannot accept assignments: " + status);
}

const core = fs.readFileSync(new URL("../phase6-store.ts", import.meta.url), "utf8");
const serviceOrder = core.slice(core.indexOf("export function assignStaffToOrder("), core.indexOf("export function completeAssignment("));
assert.match(serviceOrder, /assertPermission\("orders\.assign"\)/);
assert.match(serviceOrder, /member\.status !== "active"/, "inactive staff cannot be assigned");
assert.match(serviceOrder, /!canAssignServiceOrder\(order\)/);
assert.match(serviceOrder, /"Already assigned"/);
assert.match(serviceOrder, /enqueueOutbox\("staff_assignments", assignment\.id, "insert"/);
assert.match(serviceOrder, /enqueueOutbox\("orders", order\.id, "update"/, "order assignment must sync too");
assert.match(serviceOrder, /auditAction\("service_order\.assign"/, "order assignment must be audited");
assert.match(serviceOrder, /order\.assignedStaffId = input\.staffId/);
assert.match(serviceOrder, /order\.assignedTailorId = input\.staffId/, "existing tailor field must remain compatible");
assert.match(serviceOrder, /pushNotification\(/);

const ui = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderDetail.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
assert.match(ui, /staffAssignments\.filter\(\(assignment\) => assignment\.status !== "cancelled"\)/);
assert.match(ui, /canAssignStaff && canAssignServiceOrder\(order\)/);
assert.match(ui, /staffMembers\.filter\(\(member\) => member\.status === "active" && !assignedStaffIds\.has\(member\.id\)\)/);
assert.match(ui, /onClick=\{submitStaffAssignment\}/);
assert.match(ui, /role="alert".*staffAssignError/);
assert.match(page, /phase6Store\.listStaff\(\{ status: "active" \}\)/);
assert.match(page, /phase6Store\.assignStaffToOrder\(\{ orderId: selected\.id, staffId \}\)/);
assert.match(page, /setStaffAssignments\(phase6Store\.listAssignments\(\{ orderId: selected\.id \}\)\)/);
assert.match(page, /canAssignStaff=\{can\("orders\.assign"\)\}/);
console.log("Service order staff assignment eligibility, audit+sync and UI controls PASS");
