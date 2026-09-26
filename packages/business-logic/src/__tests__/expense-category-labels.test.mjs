import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const phase5 = require("../phase5-store.ts");

const defaults = Object.fromEntries(phase5.listExpenseCategories().map((category) => [category.id, category.name]));
assert.equal(defaults["ec-3"], "Rental");
assert.equal(defaults["ec-4"], "Water");
assert.equal(defaults["ec-6"], "Shop Purchases");

phase5.hydratePhase5({
  expenseCategories: [
    { id: "ec-3", name: "Rent", isSystem: true, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "ec-4", name: "Normal Water", isSystem: true, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "ec-6", name: "Shop Supplies", isSystem: true, createdAt: "2026-01-01T00:00:00.000Z" },
  ],
  expenses: [
    {
      id: "expense-rent",
      date: "2026-01-02T00:00:00.000Z",
      categoryId: "ec-3",
      categoryName: "Rent",
      amount: 100,
      paymentMethod: "cash",
      description: null,
      reference: null,
      receiptUrl: null,
      staffId: null,
      orderId: null,
      orderNumber: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      version: 1,
    },
  ],
});

const hydrated = Object.fromEntries(phase5.listExpenseCategories().map((category) => [category.id, category.name]));
assert.equal(hydrated["ec-3"], "Rental");
assert.equal(hydrated["ec-4"], "Water");
assert.equal(hydrated["ec-6"], "Shop Purchases");
assert.equal(phase5.listExpenses()[0].categoryName, "Rental");

console.log("Expense category labels: customer wording + legacy hydration compatibility PASS");
