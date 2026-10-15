import assert from "node:assert/strict";
import fs from "node:fs";
import { findCollectionCustomer, parseCollectionAmount } from "../collection-prefill.ts";

const rows = [
  { id: "due", outstandingBalance: 1250.75 },
  { id: "settled", outstandingBalance: 0 },
  { id: "credit", outstandingBalance: -12.5 },
  { id: "nan", outstandingBalance: Number.NaN },
  { id: "inf", outstandingBalance: Number.POSITIVE_INFINITY },
];
assert.equal(findCollectionCustomer(rows, "due")?.id, "due");
for (const id of ["settled", "credit", "nan", "inf", "missing", "", null, undefined]) {
  assert.equal(findCollectionCustomer(rows, id), null, "must not prefill invalid or fully paid customer " + id);
}
assert.equal(parseCollectionAmount("1", 1250.75), 1);
assert.equal(parseCollectionAmount(".25", 1250.75), 0.25);
assert.equal(parseCollectionAmount("1250.75", 1250.75), 1250.75);
assert.equal(parseCollectionAmount(" 10.20 ", 1250.75), 10.2);
for (const input of ["", " ", "0", "-1", "0.00", "Infinity", "NaN", "1e3", "0x10", "1.001", "5abc", "1250.76", "9999999999999999"]) {
  assert.throws(() => parseCollectionAmount(input, 1250.75), Error, "must reject " + JSON.stringify(input));
}
assert.throws(() => parseCollectionAmount("1", Number.NaN), /valid outstanding balance/);
assert.throws(() => parseCollectionAmount("1", 0), /valid outstanding balance/);

const custUi = fs.readFileSync(new URL("../../customers/CustomerList.tsx", import.meta.url), "utf8");
const custPage = fs.readFileSync(new URL("../../../../../../apps/web/src/app/(app)/customers/page.tsx", import.meta.url), "utf8");
const payPage = fs.readFileSync(new URL("../../../../../../apps/web/src/app/(app)/payments/page.tsx", import.meta.url), "utf8");
const payUi = fs.readFileSync(new URL("../PaymentsPanel.tsx", import.meta.url), "utf8");
assert.match(custUi, /onCollect && hasOutstandingCustomerBalance\(r\)/, "only unpaid customer rows display Collect Payment");
assert.match(custUi, /onClick=\{\(\) => onCollect\(r\)\}/);
assert.match(custPage, /router\.push\(\`\/payments\?customerId=\$\{encodeURIComponent\(customer\.id\)\}\`\)/);
assert.match(payPage, /new URLSearchParams\(window\.location\.search\)\.get\("customerId"\)/);
assert.match(payPage, /if \(!loaded\) return/, "customer eligibility is checked only after the local store is ready");
assert.match(payPage, /requestedCustomerId=\{requestedCustomerId\}/);
assert.match(payUi, /findCollectionCustomer\(outstanding, requestedCustomerId\)/);
assert.match(payUi, /processedCustomerLink\.current === requestedCustomerId/, "refresh must not reopen paid modal");
assert.match(payUi, /findCollectionCustomer\(outstanding, customerId\)/, "resubmit must revalidate live customer");
assert.match(payUi, /parseCollectionAmount\(amount, liveCustomer\.outstandingBalance\)/);
assert.doesNotMatch(payUi, /amount: parseFloat\(amount\) \|\| 0/);
assert.match(payUi, /No payment has been recorded/);
console.log("Customer dues -> collection payment deep link and strict amount validation PASS");
