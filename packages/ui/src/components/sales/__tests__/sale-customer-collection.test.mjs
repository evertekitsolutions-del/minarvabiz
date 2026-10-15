import assert from "node:assert/strict";
import fs from "node:fs";
import { canCollectCustomerDueFromSale, isUnpaidSale } from "../unpaid-sale-filter.ts";

const row = (patch = {}) => ({ customerId: "customer-1", status: "partial", balanceAmount: 99.25, ...patch });
assert.equal(canCollectCustomerDueFromSale(row()), true);
assert.equal(canCollectCustomerDueFromSale(row({ status: "completed" })), true);
for (const invalid of [
  row({ status: "draft" }),
  row({ status: "returned" }),
  row({ status: "cancelled" }),
  row({ balanceAmount: 0 }),
  row({ balanceAmount: -5 }),
  row({ balanceAmount: Number.NaN }),
  row({ balanceAmount: Number.POSITIVE_INFINITY }),
  row({ balanceAmount: 2 ** 54 }),
  row({ customerId: null }),
  row({ customerId: "" }),
  row({ customerId: "  " }),
]) {
  assert.equal(canCollectCustomerDueFromSale(invalid), false, "must not collect an invalid or walk-in invoice");
}
assert.equal(isUnpaidSale(row({ customerId: null })), true, "unpaid filter remains independent of customer collection action");

const salesList = fs.readFileSync(new URL("../SalesList.tsx", import.meta.url), "utf8");
const salesPage = fs.readFileSync(new URL("../../../../../../apps/web/src/app/(app)/sales/page.tsx", import.meta.url), "utf8");
assert.match(salesList, /onCollectCustomerDue && canCollectCustomerDueFromSale\(row\)/, "row action is gated");
assert.match(salesList, /onCollectCustomerDue && canCollectCustomerDueFromSale\(detailSale\)/, "modal action is gated");
assert.match(salesList, /onClick=\{\(\) => onCollectCustomerDue\(row\)\}/);
assert.match(salesList, /onCollectCustomerDue\(detailSale\)/);
assert.match(salesList, /oldest unpaid receivables first/, "must not imply invoice-specific earmarking");
assert.match(salesPage, /onCollectCustomerDue=\{\(sale\) => \{ if \(sale\.customerId\) router\.push\(\`\/payments\?customerId=\$\{encodeURIComponent\(sale\.customerId\)\}\`\); \}\}/);
assert.doesNotMatch(salesPage, /recordCustomerPayment\(/, "navigation must not write an invoice or payment");
console.log("Sales History customer-ledger collection behavior and routing PASS");
