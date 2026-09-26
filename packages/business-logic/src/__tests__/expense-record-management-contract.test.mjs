import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const expenseList = read("packages/ui/src/components/expenses/ExpenseList.tsx");
const phase5 = read("packages/business-logic/src/phase5-store.ts");
const desktop = read("apps/desktop/src/App.tsx");
const web = read("apps/web/src/app/(app)/expenses/page.tsx");

for (const token of [
  "Search description, reference or order",
  "All categories",
  "All methods",
  'type="date"',
  "Clear filters",
  "Reversal reason *",
  "It is not a hard delete",
]) assert.equal(expenseList.includes(token), true, `Missing professional expense control: ${token}`);

assert.match(phase5, /reverseExpense\(id: UUID, reason: string\)/);
assert.equal(phase5.includes("Reversal reason is required"), true);
assert.equal(phase5.includes("reversalReason"), true);
assert.equal(phase5.includes('auditAction("expense.reverse"'), true);

assert.equal(desktop.includes("phase5Store.reverseExpense(expense.id,reason)"), true);
assert.equal(desktop.includes("categories={expenseCategories}"), true);
assert.equal(web.includes("phase5Store.reverseExpense(expense.id, reason)"), true);
assert.equal(web.includes("categories={categories}"), true);

console.log("Expense record management contract PASS");
