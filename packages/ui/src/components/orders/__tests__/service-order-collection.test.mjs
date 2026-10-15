import assert from "node:assert/strict";
import fs from "node:fs";
import { canCollectServiceOrderBalance } from "../service-order-collection.ts";

const order = { customerId: "customer-1", balance: 299.5, status: "pending" };
assert.equal(canCollectServiceOrderBalance(order), true);
assert.equal(canCollectServiceOrderBalance({ ...order, status: "delivered" }), true, "delivered invoices can remain unpaid");
for (const bad of [
  { customerId: "", balance: 100, status: "pending" },
  { customerId: "customer-1", balance: 0, status: "pending" },
  { customerId: "customer-1", balance: -20, status: "pending" },
  { customerId: "customer-1", balance: NaN, status: "pending" },
  { customerId: "customer-1", balance: Infinity, status: "pending" },
  { customerId: "customer-1", balance: 20, status: "cancelled" },
]) {
  assert.equal(canCollectServiceOrderBalance(bad), false);
}

const ui = fs.readFileSync(new URL("../OrderDetail.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
assert.match(ui, /onCollectBalance && canCollectServiceOrderBalance\(order\)/);
assert.match(ui, /onClick=\{\(\) => onCollectBalance\(order\)\}/);
assert.match(page, /onCollectBalance=\{\(order\) => router\.push\(\`\/payments\?customerId=\$\{encodeURIComponent\(order\.customerId\)\}\`\)\}/);
console.log("Service order balance collection navigation and safety gate PASS");
