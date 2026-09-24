import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  filename
);

const utils = require("../../../utils/src/index.ts");
const profit = require("../profit.ts");
const reports = require("../reports.ts");
const businessIntelligence = require("../business-intelligence.ts");
const branchIntelligence = require("../branch-intelligence.ts");

assert.equal(utils.divideMinorUnits(utils.toMinorUnits(0.3), 3), 10);
assert.equal(utils.fromMinorUnits(utils.divideMinorUnits(utils.toMinorUnits(0.1 + 0.2), 3)), 0.1);

assert.deepEqual(
  profit.calculatePeriodSummary({
    productSalesRevenue: 0.1,
    serviceRevenue: 0.2,
    inventoryCostOfGoods: 0.03,
    orderMaterialCosts: 0.07,
    orderSpecificExpenses: 0.02,
    generalExpenses: 0.03,
    staffIncentives: 0.05,
  }),
  {
    totalRevenue: 0.3,
    totalCostOfGoods: 0.1,
    grossProfit: 0.2,
    totalOperatingExpenses: 0.1,
    netProfit: 0.1,
  },
);

assert.equal(
  reports.buildDayEndReport({
    productSales: 0.1,
    serviceRevenue: 0.1,
    laundryRevenue: 0.1,
    costOfGoods: 0.03,
    orderMaterialCosts: 0.07,
    orderSpecificExpenses: 0.02,
    generalExpenses: 0.03,
    staffIncentives: 0.05,
    cashReceived: 0.1,
    cardPayments: 0.1,
    otherPayments: 0.1,
    outstandingAmount: 0.1 + 0.2,
  }).totalSales,
  0.3,
);

const summedRows = reports.sumSalesReportRows([
  { label: "A", productSales: 0.1, serviceRevenue: 0.1, laundryRevenue: 0, totalRevenue: 0.2, expenses: 0.03, netProfit: 0.17 },
  { label: "B", productSales: 0.2, serviceRevenue: 0, laundryRevenue: 0.1, totalRevenue: 0.3, expenses: 0.07, netProfit: 0.23 },
]);
assert.deepEqual(summedRows, {
  label: "Total",
  productSales: 0.3,
  serviceRevenue: 0.1,
  laundryRevenue: 0.1,
  totalRevenue: 0.5,
  expenses: 0.1,
  netProfit: 0.4,
});

const bi = businessIntelligence.buildBusinessIntelligence(
  [
    { date: "2026-09-24T00:00:00.000Z", total: 0.1, cost: 0.03, branchId: "b1", productId: "p1", productName: "P" },
    { date: "2026-09-24T00:00:00.000Z", total: 0.2, cost: 0.07, branchId: "b1", productId: "p1", productName: "P" },
  ],
  [{ date: "2026-09-24T00:00:00.000Z", amount: 0.1, branchId: "b1" }],
  1,
  new Date("2026-09-24T00:00:00.000Z"),
);
assert.equal(bi.revenue, 0.3);
assert.equal(bi.costOfGoods, 0.1);
assert.equal(bi.grossProfit, 0.2);
assert.equal(bi.operatingExpenses, 0.1);
assert.equal(bi.estimatedNetProfit, 0.1);
assert.equal(bi.branchSummaries[0].netProfit, 0.1);
assert.equal(bi.productSummaries[0].grossProfit, 0.2);

const branches = branchIntelligence.compareBranches([
  {
    branchId: "b1",
    branchName: "Main",
    revenue: 0.1 + 0.2,
    cost: 0.1,
    expenses: 0.1,
    orders: 3,
    activeOrders: 0,
    stockValue: 0.1 + 0.2,
  },
]);
assert.equal(branches[0].revenue, 0.3);
assert.equal(branches[0].grossProfit, 0.2);
assert.equal(branches[0].netProfit, 0.1);
assert.equal(branches[0].averageOrderValue, 0.1);
assert.equal(branches[0].stockValue, 0.3);

const sources = [
  "business-intelligence.ts",
  "branch-intelligence.ts",
  "dashboard.ts",
  "profit.ts",
  "reports.ts",
  "live-dashboard.ts",
].map((name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

for (const source of sources) {
  assert.doesNotMatch(source, /\.toFixed\(/);
  assert.doesNotMatch(source, /Number\.EPSILON/);
}
assert.match(sources[0], /divideMinorUnits/);
assert.match(sources[1], /averageOrderValue: branch\.orders > 0 \? fromMinorUnits\(divideMinorUnits/);
assert.match(sources[2], /totalRevenueMinor = addMinorUnits/);
assert.match(sources[3], /totalOperatingExpensesMinor = addMinorUnits/);
assert.match(sources[4], /const totals = rows\.reduce/);
assert.match(sources[5], /multiplyMinorByQuantity/);

const nextActionsSource = fs.readFileSync(new URL("../next-best-actions.ts", import.meta.url), "utf8");
assert.doesNotMatch(nextActionsSource, /Math\.round\(outstanding\)/);
assert.match(nextActionsSource, /toMinorUnits\(outstanding\)/);

console.log("Analytics and reporting minor-unit money tests passed");
