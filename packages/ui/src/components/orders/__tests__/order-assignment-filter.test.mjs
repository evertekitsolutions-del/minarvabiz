import assert from "node:assert/strict";
import fs from "node:fs";
import {
  filterServiceOrdersByAssignedStaff,
  assignedStaffNamesForOrder,
} from "../order-assignment-filter.ts";

const orders = [
  { id: "one", assignedStaffId: "legacy-1", assignedTailorId: null },
  { id: "multi", assignedStaffId: "staff-1", assignedTailorId: "staff-1" },
  { id: "unassigned", assignedStaffId: null, assignedTailorId: null },
  { id: "cancelled-record", assignedStaffId: "stale-id", assignedTailorId: "stale-id" },
  { id: "legacy", assignedStaffId: null, assignedTailorId: "legacy-2" },
];
const assignments = [
  { orderId: "multi", staffId: "staff-1", staffName: "Meena", status: "completed" },
  { orderId: "multi", staffId: "staff-2", staffName: "Arun", status: "assigned" },
  { orderId: "cancelled-record", staffId: "stale-id", staffName: "Old Staff", status: "cancelled" },
];
const staff = [
  { id: "legacy-1", name: "Lisa" },
  { id: "legacy-2", name: "Chris" },
  { id: "staff-1", name: "Meena" },
  { id: "staff-2", name: "Arun" },
];
const ids = (rows) => rows.map((row) => row.id);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "")), ids(orders));
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "unassigned")), ["unassigned", "cancelled-record"]);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "staff-2")), ["multi"]);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "staff-1")), ["multi"]);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "legacy-1")), ["one"]);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "legacy-2")), ["legacy"]);
assert.deepEqual(ids(filterServiceOrdersByAssignedStaff(orders, assignments, "stale-id")), []);
assert.deepEqual(assignedStaffNamesForOrder(orders[1], assignments, staff), ["Meena", "Arun"]);
assert.deepEqual(assignedStaffNamesForOrder(orders[3], assignments, staff), []);
assert.deepEqual(assignedStaffNamesForOrder(orders[0], assignments, staff), ["Lisa"]);
assert.deepEqual(assignedStaffNamesForOrder(orders[4], assignments, staff), ["Chris"]);

const orderList = fs.readFileSync(new URL("../OrderList.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
assert.match(orderList, /filterServiceOrdersByAssignedStaff\(dateFiltered, staffAssignments, assignedStaffFilter\)/);
assert.match(orderList, /exportServiceOrdersCsv\(visibleOrders\)/, "same assignment-filtered rows must go to CSV");
assert.match(orderList, /assignedStaffNamesForOrder\(r, staffAssignments, staffMembers\)/);
assert.match(orderList, /setAssignedStaffFilter\(""\)/, "Clear filters resets staff selection");
assert.match(orderList, /value="unassigned">Unassigned orders/);
assert.match(page, /staffAssignments=\{allAssignments\}/);
assert.match(page, /setAllAssignments\(phase6Store\.listAssignments\(\)\)/);
console.log("Service Orders assigned staff selection, migrated data and filtered CSV PASS");
