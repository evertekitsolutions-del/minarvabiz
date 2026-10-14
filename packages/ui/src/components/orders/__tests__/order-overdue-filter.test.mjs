import assert from "node:assert/strict";
import fs from "node:fs";
import { isOverdueServiceOrder, localBusinessDate } from "../order-overdue-filter.ts";

assert.equal(localBusinessDate(new Date(2026, 9, 15, 23, 59)), "2026-10-15");
assert.equal(localBusinessDate(new Date(2026, 0, 1)), "2026-01-01");

const overdue = (deliveryDate, status = "pending", today = "2026-10-15") =>
  isOverdueServiceOrder({ deliveryDate, status }, today);

assert.equal(overdue("2026-10-14"), true, "past delivery must be highlighted");
assert.equal(overdue("2026-10-01T12:00:00Z", "ready_to_deliver"), true, "ready is not delivered");
assert.equal(overdue("2026-10-15"), false, "due today is not overdue");
assert.equal(overdue("2026-10-16"), false, "future delivery is not overdue");
assert.equal(overdue("2026-10-14", "delivered"), false);
assert.equal(overdue("2026-10-14", "cancelled"), false);
assert.equal(overdue(null), false);
assert.equal(overdue("invalid"), false);
assert.equal(overdue("2026-10-14", "pending", "bad-date"), false);

const ui = fs.readFileSync(new URL("../OrderList.tsx", import.meta.url), "utf8");
assert.match(ui, /checked=\{overdueOnly\}/);
assert.match(ui, /setOverdueOnly\(false\)/, "clear filters must also reset overdue");
assert.match(ui, /orders\.filter\(\(order\) => isOverdueServiceOrder\(order, businessDay\)\)/);
assert.match(ui, /rows=\{visibleOrders\}/);
assert.match(ui, /No overdue orders match the selected filters/);
console.log("Service order overdue date and frontend filter tests PASS");
