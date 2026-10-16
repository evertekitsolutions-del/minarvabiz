import assert from "node:assert/strict";
import fs from "node:fs";
import { parseExpenseAmount, parsePurchaseAmounts } from "../finance-entry-draft.ts";

assert.equal(parseExpenseAmount("1"), 1);
assert.equal(parseExpenseAmount(".01"), 0.01);
assert.equal(parseExpenseAmount("1.2"), 1.2);
assert.equal(parseExpenseAmount(" 1234.50 "), 1234.5);
for(const value of ["", " ", "0", "0.00", "-1", "NaN", "Infinity", "1e5", "0x20", "1.001", "10abc", "9999999999999999999"]) {
  assert.throws(() => parseExpenseAmount(value), /amount/i, "no invalid/zero expense amount: " + value);
}
assert.deepEqual(parsePurchaseAmounts("100", ""), { amount:100, paidAmount:0 });
assert.deepEqual(parsePurchaseAmounts("100.50", "99.75"), { amount:100.5, paidAmount:99.75 });
assert.deepEqual(parsePurchaseAmounts("100", "100"), { amount:100, paidAmount:100 });
for(const paid of ["100.01", "-1", "NaN", "Infinity", "1e3", "1.234", "100xyz"]) {
  assert.throws(() => parsePurchaseAmounts("100", paid), /paid|amount/i, "invalid/excess paid: " + paid);
}
assert.throws(() => parsePurchaseAmounts("0", ""), /amount/i);
assert.throws(() => parsePurchaseAmounts("", ""), /amount/i);

const expenses = fs.readFileSync(new URL("../../app/(app)/expenses/page.tsx", import.meta.url), "utf8");
const purchases = fs.readFileSync(new URL("../../app/(app)/purchases/page.tsx", import.meta.url), "utf8");
const expCode = expenses.slice(expenses.indexOf("  function saveExpense()"), expenses.indexOf("  function reverseExpense("));
const oldPurchaseCode = expenses.slice(expenses.indexOf("  function savePurchase()"), expenses.indexOf("\n\n  return (", expenses.indexOf("  function savePurchase()")));
const purchaseCode = purchases.slice(purchases.indexOf("  function savePurchase()"), purchases.indexOf("  function saveSupplier("));
assert.match(expCode, /parseExpenseAmount\(expForm\.amount\)/);
assert.match(oldPurchaseCode, /parsePurchaseAmounts\(purForm\.amount, purForm\.paidAmount\)/);
assert.match(purchaseCode, /parsePurchaseAmounts\(form\.amount, form\.paidAmount\)/);
for(const [name,save] of [["expense",expCode],["old purchase",oldPurchaseCode],["purchase",purchaseCode]]) {
  assert.doesNotMatch(save, /parseFloat\(/, name + " must not silently coerce");
  assert.match(save, /catch\s*\(error\)/, name + " must surface backend exceptions");
}
assert.match(expenses, /role="alert"[^>]*>\{error\}/);
assert.match(purchases, /role="alert"[^>]*>\{error\}/);
console.log("Expenses and purchases exact amounts, overpayment prevention, and UI errors PASS");
