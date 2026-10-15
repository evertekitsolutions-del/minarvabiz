import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSupplierPaymentAmount } from "../supplier-payment-draft.ts";

assert.equal(parseSupplierPaymentAmount("125.75", 125.75), 125.75);
assert.equal(parseSupplierPaymentAmount("0.01", 125.75), 0.01);
assert.equal(parseSupplierPaymentAmount(" 20.5 ", 125.75), 20.5);
assert.equal(parseSupplierPaymentAmount(".50", 125.75), 0.5);
for (const raw of ["", " ", "0", "0.00", "-1", "0.001", "3.141", "1e5", "0x20", "NaN", "Infinity", "20abc", "125.76", "99999999999999999"]) {
  assert.throws(() => parseSupplierPaymentAmount(raw, 125.75), Error, "invalid amount must not silently be capped: " + JSON.stringify(raw));
}
for (const due of [0, -1, NaN, Infinity, 2 ** 54]) {
  assert.throws(() => parseSupplierPaymentAmount("1", due), Error, "invalid payable must not open a payment");
}

const page = fs.readFileSync(new URL("../../app/(app)/suppliers/page.tsx", import.meta.url), "utf8");
const start = page.indexOf("function savePayment()");
const end = page.indexOf("\n\n  return (", start);
assert.ok(start > 0 && end > start);
const save = page.slice(start, end);
assert.match(save, /phase5Store\.listSuppliers\(\)\.find/, "reload live payable instead of stale dialog data");
assert.match(save, /parseSupplierPaymentAmount\(paymentForm\.amount, supplier\.outstandingBalance\)/);
assert.match(save, /if \(result\.errors\.length \|\| !result\.payment\)/);
assert.match(save, /catch \(error\)/, "backend throws must stay visible");
assert.doesNotMatch(save, /parseFloat\(paymentForm\.amount\)/);
assert.doesNotMatch(save, /amount: parseFloat/);
assert.match(page, /role="alert" className="text-sm text-rose-600">\{paymentError\}/);
console.log("Supplier payment validation and safe live-payable frontend posting PASS");
