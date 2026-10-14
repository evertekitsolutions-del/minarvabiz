import assert from "node:assert/strict";
import fs from "node:fs";
import { exportServiceOrdersCsv } from "../service-orders-csv.ts";

const sample = (override = {}) => ({
  orderNumber: "ORD-001",
  orderDate: "2026-10-14T10:00:00Z",
  deliveryDate: "2026-10-20",
  customerName: 'Customer, "A"',
  serviceType: "ladies_tailoring",
  status: "pending",
  price: 450.5,
  discount: 50,
  advance: 100,
  balance: 300.5,
  quantity: 1,
  notes: "Priority",
  ...override,
});
const orders = [sample(), sample({
  orderNumber: "=HYPERLINK(\"https://invalid.example\")",
  customerName: " \t@unsafe",
  notes: "\n+SUM(2,2)",
  status: "ready_to_deliver",
})];
const before = JSON.stringify(orders);
const csv = exportServiceOrdersCsv(orders);
assert.equal(JSON.stringify(orders), before, "CSV must not mutate orders");
assert.match(csv, /^order_number,order_date,delivery_date,customer,service_type,status,price,discount,advance,balance,quantity,notes\n/);
assert.ok(csv.includes('"Customer, ""A"""'), "quoted customer names escape correctly");
assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://invalid.example\"\")\""), "formula order reference must be escaped");
assert.ok(csv.includes("' \t@unsafe"), "whitespace formula payloads must be neutralized");
assert.ok(csv.includes("\"'\n+SUM(2,2)\""), "multiline formula notes must be neutralized");
assert.equal(exportServiceOrdersCsv([]), "order_number,order_date,delivery_date,customer,service_type,status,price,discount,advance,balance,quantity,notes\n");
assert.throws(() => exportServiceOrdersCsv([sample({ balance: Infinity })]), /invalid numeric amount/);
assert.throws(() => exportServiceOrdersCsv([sample({ advance: NaN })]), /invalid numeric amount/);

const ui = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderList.tsx", import.meta.url), "utf8");
assert.match(ui, /exportServiceOrdersCsv\(visibleOrders\)/, "use exact table-visible rows, including overdue filter");
assert.match(ui, /rows=\{visibleOrders\}/);
assert.match(ui, /disabled=\{visibleOrders\.length === 0\}/);
assert.match(ui, /onClick=\{downloadVisibleOrdersCsv\}/);
assert.match(ui, /String\.fromCharCode\(0xfeff\)/);
assert.match(ui, /URL\.revokeObjectURL\(url\)/);
console.log("Service order CSV export content and frontend linkage tests PASS");
