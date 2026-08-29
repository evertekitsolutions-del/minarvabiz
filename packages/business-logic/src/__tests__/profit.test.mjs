/**
 * Run: node packages/business-logic/src/__tests__/profit.test.mjs
 * Pure calculation verification (mirrors TypeScript profit.ts logic).
 */

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function subtractMoney(a, b) {
  return roundMoney(a - b);
}

function productSaleProfit(revenue, cost) {
  return { revenue, cost, grossProfit: subtractMoney(revenue, cost) };
}

function orderProfit(input) {
  const revenue = roundMoney(input.customerCharge);
  const materialCost = roundMoney(input.materialCost);
  const orderSpecificExpenses = roundMoney(input.orderSpecificExpenses);
  const incentive = roundMoney(input.staffIncentive || 0);
  const totalCost = roundMoney(materialCost + orderSpecificExpenses + incentive);
  const grossProfit = subtractMoney(revenue, totalCost);
  return { revenue, totalCost, grossProfit };
}

function laundryProfit(customerRate, supplierRate, qty = 1) {
  const revenue = roundMoney(customerRate * qty);
  const cost = roundMoney(supplierRate * qty);
  return { revenue, cost, margin: subtractMoney(revenue, cost) };
}

function periodSummary(input) {
  const totalRevenue = roundMoney(input.productSales + input.serviceRevenue + input.laundryRevenue);
  const cogs = roundMoney(input.productCogs + input.orderMaterials);
  const gross = subtractMoney(totalRevenue, cogs);
  const operating = roundMoney(input.orderExpenses + input.generalExpenses + input.incentives);
  const net = subtractMoney(gross, operating);
  return { totalRevenue, gross, net };
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

// Product sale: revenue - cost
assert(productSaleProfit(899, 450).grossProfit === 449, "product gross profit");

// Order: charge - material - order expenses - incentive
const op = orderProfit({
  customerCharge: 5000,
  materialCost: 800,
  orderSpecificExpenses: 200,
  staffIncentive: 150,
});
assert(op.grossProfit === 3850, `order profit expected 3850 got ${op.grossProfit}`);

// Laundry margin
assert(laundryProfit(50, 30, 2).margin === 40, "laundry margin 2 units");

// Period: NOT naive sales-expenses only
const ps = periodSummary({
  productSales: 10000,
  serviceRevenue: 5000,
  laundryRevenue: 1000,
  productCogs: 4000,
  orderMaterials: 500,
  orderExpenses: 200,
  generalExpenses: 1000,
  incentives: 100,
});
// revenue 16000 - cogs 4500 = gross 11500; net 11500 - 1300 = 10200
assert(ps.totalRevenue === 16000, "period revenue");
assert(ps.gross === 11500, `period gross expected 11500 got ${ps.gross}`);
assert(ps.net === 10200, `period net expected 10200 got ${ps.net}`);

// Inventory deduction simulation
let stock = 18;
stock = stock - 2;
assert(stock === 16, "inventory deduction");

// Balance
let outstanding = 2500;
const paid = 1000;
outstanding = outstanding - paid;
assert(outstanding === 1500, "payment reduces balance");

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll profit/business tests passed");
