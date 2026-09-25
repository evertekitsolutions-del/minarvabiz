import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const utils = require("../../../utils/src/index.ts");
const billing = require("../../../billing/src/index.ts");
const inventory = require("../inventory.ts");
const csv = require("../csv-import.ts");
const accounting = require("../accounting-store.ts");
const permissions = require("../permissions.ts");
const outbox = require("../outbox-bridge.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const SEED = 0x21f00d5;
let rngState = SEED >>> 0;

function randomU32() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function randomInt(min, max) {
  return min + (randomU32() % (max - min + 1));
}

function referenceRoundedDivide(product, denominator) {
  const raw = BigInt(product);
  const divisor = BigInt(denominator);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  let quotient = absolute / divisor;
  if ((absolute % divisor) * 2n >= divisor) quotient += 1n;
  return Number(negative ? -quotient : quotient);
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const initialChart = accounting.exportAccountingState().accounts;
const cash = initialChart.find((account) => account.systemKey === "cash");
const expense = initialChart.find((account) => account.systemKey === "general_expenses");
assert.ok(cash && expense, "required system accounts must exist");

function resetAccounting() {
  accounting.hydrateAccountingState({
    accounts: initialChart,
    journals: [],
    journalSequence: 0,
  });
  outbox.hydrateOutbox([]);
}

function journalInput(entryDate, amount, creditAmount = amount) {
  return {
    entryDate,
    description: "Property invariant",
    lines: [
      { accountId: expense.id, debit: amount },
      { accountId: cash.id, credit: creditAmount },
    ],
  };
}

// MONEY INVARIANTS
for (let i = 0; i < 1500; i += 1) {
  const cents = randomInt(-5_000_000, 5_000_000);
  const other = randomInt(-5_000_000, 5_000_000);
  const amount = cents / 100;

  assert.equal(utils.toMinorUnits(amount), cents, "money round-trip must preserve exact cents");
  assert.equal(
    utils.subtractMinorUnits(utils.addMinorUnits(cents, other), other),
    cents,
    "minor-unit add/subtract must be inverse operations",
  );

  const quantityMilli = randomInt(0, 25_000);
  const quantity = quantityMilli / 1000;
  const actualProduct = utils.multiplyMinorByQuantity(cents, quantity);
  const expectedProduct = referenceRoundedDivide(BigInt(cents) * BigInt(quantityMilli), 1000);
  assert.equal(actualProduct, expectedProduct, "money x quantity must use deterministic half-up rounding");

  const basisPoints = randomInt(0, 10_000);
  const percent = basisPoints / 100;
  const actualPercent = utils.percentOfMinor(cents, percent);
  const expectedPercent = referenceRoundedDivide(BigInt(cents) * BigInt(basisPoints), 10_000);
  assert.equal(actualPercent, expectedPercent, "percentage calculation must match integer reference");
}

// QUANTITY / BILLING / INVENTORY INVARIANTS
for (let i = 0; i < 750; i += 1) {
  const currentMilli = randomInt(-50_000, 200_000);
  const movementMilli = randomInt(0, 25_000);
  const current = currentMilli / 1000;
  const movement = movementMilli / 1000;

  assert.equal(utils.toQuantityMilli(current), currentMilli);
  const afterIn = inventory.applyStockMovement(current, "stock_in", movement);
  const afterRoundTrip = inventory.applyStockMovement(afterIn, "stock_out", movement);
  assert.equal(
    utils.toQuantityMilli(afterRoundTrip),
    currentMilli,
    "stock-in followed by equal stock-out must conserve quantity",
  );

  const fromLocation = inventory.applyStockMovement(current, "transfer", movement);
  const toLocation = inventory.applyStockMovement(0, "stock_in", movement);
  assert.equal(
    utils.toQuantityMilli(fromLocation) + utils.toQuantityMilli(toLocation),
    currentMilli,
    "two-sided transfer must conserve total milli-quantity",
  );

  const unitPriceCents = randomInt(0, 250_000);
  const discountBasis = randomInt(0, 10_000);
  const taxBasis = randomInt(0, 5_000);
  const line = billing.calculateLineItem({
    quantity: movement || 0.001,
    unitPrice: unitPriceCents / 100,
    discountPercent: discountBasis / 100,
    taxRate: taxBasis / 100,
  });

  for (const value of Object.values(line)) {
    assert.ok(Number.isFinite(value), "billing output must always be finite");
    assert.equal(utils.toMinorUnits(value), Math.round(value * 100), "billing output must be cent-canonical");
  }
  assert.equal(
    utils.toMinorUnits(line.taxableAmount),
    utils.subtractMinorUnits(utils.toMinorUnits(line.subtotal), utils.toMinorUnits(line.discountAmount)),
    "taxable amount must equal subtotal minus discount",
  );
  assert.equal(
    utils.toMinorUnits(line.total),
    utils.addMinorUnits(utils.toMinorUnits(line.taxableAmount), utils.toMinorUnits(line.taxAmount)),
    "line total must equal taxable amount plus tax",
  );

  const singleInvoice = billing.calculateInvoiceTotals({
    items: [{
      quantity: movement || 0.001,
      unitPrice: unitPriceCents / 100,
      discountPercent: discountBasis / 100,
      taxRate: taxBasis / 100,
    }],
  });
  assert.equal(
    utils.toMinorUnits(singleInvoice.grandTotal),
    utils.toMinorUnits(line.total),
    "single-line invoice without global adjustments must equal its line total",
  );

  const globalDiscount = randomInt(0, 5_000) / 100;
  const globalTax = randomInt(0, 2_500) / 100;
  const adjustedInvoice = billing.calculateInvoiceTotals({
    items: [{
      quantity: movement || 0.001,
      unitPrice: unitPriceCents / 100,
      discountPercent: discountBasis / 100,
      taxRate: taxBasis / 100,
    }],
    globalDiscountPercent: globalDiscount,
    globalTaxRate: globalTax,
  });
  for (const value of Object.values(adjustedInvoice)) {
    assert.ok(Number.isFinite(value), "invoice totals must always stay finite");
    assert.equal(utils.toMinorUnits(value), Math.round(value * 100), "invoice totals must stay cent-canonical");
  }

  const secondMilli = randomInt(0, 25_000);
  const secondQuantity = secondMilli / 1000;
  const secondCostCents = randomInt(0, 250_000);
  const valuation = inventory.inventoryValuation([
    { productId: "a", name: "A", quantity: current, costPrice: unitPriceCents / 100 },
    { productId: "b", name: "B", quantity: secondQuantity, costPrice: secondCostCents / 100 },
  ]);
  assert.equal(
    utils.toQuantityMilli(valuation.totalUnits),
    currentMilli + secondMilli,
    "inventory valuation must conserve summed quantity",
  );
  assert.equal(
    valuation.totalValue,
    utils.roundMoney(current * (unitPriceCents / 100) + secondQuantity * (secondCostCents / 100)),
    "inventory valuation must equal rounded sum of quantity x cost",
  );
  assert.equal(inventory.isLowStock(current, current), true);
  assert.equal(inventory.isOutOfStock(Math.min(0, current)), true);
}

// DATE INVARIANTS THROUGH ACCOUNTING VALIDATION
for (let i = 0; i < 240; i += 1) {
  resetAccounting();
  const year = randomInt(2020, 2035);
  const month = randomInt(1, 12);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = randomInt(1, maxDay);
  const date = isoDate(year, month, day);
  const amount = randomInt(1, 1_000_000) / 100;
  const created = accounting.createJournalEntry(journalInput(date, amount));
  assert.deepEqual(created.errors, [], `valid calendar date ${date} must be accepted`);
  assert.equal(created.journalEntry.entryDate, date);

  resetAccounting();
  const invalidDay = maxDay + randomInt(1, 5);
  const invalidDate = isoDate(year, month, invalidDay);
  const before = JSON.stringify(accounting.exportAccountingState());
  const rejected = accounting.createJournalEntry(journalInput(invalidDate, amount));
  assert.ok(rejected.errors.includes("Invalid journal date"), `invalid calendar date ${invalidDate} must be rejected`);
  assert.equal(JSON.stringify(accounting.exportAccountingState()), before, "invalid date must not mutate accounting state");
}

// IMPORT INVARIANTS
const invalidNumericTokens = [
  "NaN",
  "Infinity",
  "-Infinity",
  "1e999",
  "-1e999",
  "--1",
  "1_000",
  "not-a-number",
];

for (let i = 0; i < 400; i += 1) {
  const cost = randomInt(-50_000, 500_000) / 100;
  const price = randomInt(-50_000, 500_000) / 100;
  const stock = randomInt(-100_000, 500_000) / 1000;
  const min = randomInt(-10_000, 100_000) / 1000;
  const parsed = csv.parseProductCsv(
    `name,sku,cost,price,stock,min,unit\nItem-${i},SKU-${i},${cost},${price},${stock},${min},pcs`,
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  for (const field of ["cost", "price", "stock", "min"]) {
    assert.ok(Number.isFinite(parsed.rows[0][field]), `valid CSV ${field} must stay finite`);
  }
}

for (const token of invalidNumericTokens) {
  for (const field of ["cost", "price", "stock", "min"]) {
    const headers = ["name", "cost", "price", "stock", "min"];
    const values = ["Bad row", "1", "2", "3", "4"];
    values[headers.indexOf(field)] = token;
    const parsed = csv.parseProductCsv(`${headers.join(",")}\n${values.join(",")}`);
    assert.equal(parsed.rows.length, 1);
    assert.ok(parsed.errors.some((error) => error.includes(`${field} must be a finite number`)));
    assert.equal(parsed.rows[0][field], 0, "invalid numeric import must fail safe to zero");
    assert.ok(Number.isFinite(parsed.rows[0][field]), "invalid numeric import must never leak NaN/Infinity");
  }
}

const fuzzAlphabet = "0123456789eE+-.x_ abcINFnty";
for (let i = 0; i < 500; i += 1) {
  let token = "";
  const length = randomInt(1, 14);
  for (let n = 0; n < length; n += 1) {
    token += fuzzAlphabet[randomInt(0, fuzzAlphabet.length - 1)];
  }
  const parsed = csv.parseProductCsv(`name,cost,price,stock,min\nFuzz,${token},${token},${token},${token}`);
  assert.equal(parsed.rows.length, 1);
  for (const field of ["cost", "price", "stock", "min"]) {
    assert.ok(Number.isFinite(parsed.rows[0][field]), `fuzzed CSV ${field} must always be finite`);
  }
}

// DOUBLE-ENTRY ACCOUNTING INVARIANTS
resetAccounting();
let postedTotalMinor = 0;
for (let i = 0; i < 300; i += 1) {
  const amountMinor = randomInt(1, 500_000);
  const amount = amountMinor / 100;
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  const date = isoDate(2026, month, day);

  const created = accounting.createJournalEntry(journalInput(date, amount));
  assert.deepEqual(created.errors, []);
  const posted = accounting.postJournalEntry(created.journalEntry.id);
  assert.deepEqual(posted.errors, []);
  assert.equal(utils.toMinorUnits(posted.journalEntry.totalDebit), amountMinor);
  assert.equal(utils.toMinorUnits(posted.journalEntry.totalCredit), amountMinor);
  postedTotalMinor = utils.addMinorUnits(postedTotalMinor, amountMinor);
}

const balanceSheet = accounting.buildBalanceSheet();
assert.equal(balanceSheet.balanced, true, "any sequence of balanced journals must keep the balance sheet balanced");
assert.equal(utils.toMinorUnits(balanceSheet.difference), 0);
assert.equal(
  utils.toMinorUnits(accounting.buildProfitAndLoss().totalExpenses),
  postedTotalMinor,
  "posted expense total must equal generated debit total",
);

for (let i = 0; i < 120; i += 1) {
  resetAccounting();
  const debitMinor = randomInt(1, 500_000);
  let creditMinor = randomInt(1, 500_000);
  if (creditMinor === debitMinor) creditMinor += 1;
  const created = accounting.createJournalEntry(
    journalInput("2026-09-25", debitMinor / 100, creditMinor / 100),
  );
  assert.deepEqual(created.errors, [], "unbalanced journals may exist as drafts");
  const before = JSON.stringify(accounting.exportAccountingState());
  const posted = accounting.postJournalEntry(created.journalEntry.id);
  assert.ok(posted.errors.some((error) => error.includes("Journal is not balanced")));
  assert.equal(JSON.stringify(accounting.exportAccountingState()), before, "failed post must not mutate draft state");
}

console.log(
  `Property/fuzz invariants PASS (seed=0x${SEED.toString(16)}): money, quantity, billing, dates, CSV imports and double-entry accounting.`,
);
