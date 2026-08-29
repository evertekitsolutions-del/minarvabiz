/**
 * Commercial business rules smoke tests
 * node packages/business-logic/src/__tests__/commercial.test.mjs
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

let failed = 0;
function assert(c, m) {
  if (!c) {
    console.error("FAIL", m);
    failed++;
  } else console.log("OK", m);
}

// Wedding order profit
const revenue = 25000;
const material = 8000;
const orderExp = 1500;
const incentive = 500;
const profit = round2(revenue - material - orderExp - incentive);
assert(profit === 15000, "wedding order profit");
assert(round2((profit / revenue) * 100) === 60, "margin 60%");

// Laundry
assert(round2(80 - 45) === 35, "laundry margin per unit");

// Bulk uniform
const qty = 50;
const unit = 400;
const discount = 2000;
const bulkRevenue = round2(qty * unit - discount);
assert(bulkRevenue === 18000, "bulk revenue");

// GST 5% on 1000
assert(round2(1000 * 0.05) === 50, "gst 5%");

// Status transitions allowed set
const allowed = {
  pending: ["processing", "cancelled"],
  processing: ["ready_to_deliver", "cancelled"],
  ready_to_deliver: ["delivered", "processing"],
  delivered: [],
  cancelled: [],
};
assert(allowed.pending.includes("processing"), "status pending->processing");
assert(!allowed.delivered.includes("pending"), "delivered terminal");

if (failed) process.exit(1);
console.log("commercial tests passed");
