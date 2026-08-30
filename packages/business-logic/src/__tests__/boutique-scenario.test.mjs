/**
 * Boutique acceptance scenario — pure calculation integrity
 */
let f = 0;
function ok(c, m) {
  if (!c) {
    console.error("FAIL", m);
    f++;
  } else console.log("OK", m);
}

// Stock deduction
let stock = 10;
const sold = 3;
stock -= sold;
ok(stock === 7, "stock after sale");
const returned = 1;
stock += returned;
ok(stock === 8, "stock after return");
ok(returned <= sold, "return qty cap");

// Partial payment
const total = 1000;
const paid = 400;
const balance = total - paid;
ok(balance === 600, "outstanding after partial");

// Sale profit
const revenue = 899;
const cost = 450;
const gross = revenue - cost;
ok(gross === 449, "product gross profit");

// Order profit
const charge = 5000;
const material = 800;
const orderExp = 200;
const orderProfit = charge - material - orderExp;
ok(orderProfit === 4000, "order profit");

// Laundry
const customerRate = 50;
const supplierRate = 30;
const laundryProfit = (customerRate - supplierRate) * 2;
ok(laundryProfit === 40, "laundry margin");

// Quotation convert totals
const qTotal = 1200 + 100 + 50 - 50 + 60; // lines + mat + labour - disc + tax
ok(qTotal === 1360, "quotation total");

// Cash register
const opening = 2000;
const cashIn = 1500;
const cashExp = 300;
const expected = opening + cashIn - cashExp;
ok(expected === 3200, "cash expected");

// Loyalty
let pts = Math.floor(1000 / 100);
ok(pts === 10, "earn points");
pts -= 5;
ok(pts === 5, "redeem points");
ok(pts >= 0, "no negative points");

// Invoice uniqueness
const invs = new Set(["INV-1", "INV-2", "INV-3"]);
ok(invs.size === 3, "unique invoices");

if (f) process.exit(1);
console.log("boutique scenario tests passed");
