/**
 * Deterministic business-intelligence calculations.
 * AI may consume these facts later, but must not replace financial arithmetic.
 */

import {
  addMinorUnits,
  divideMinorUnits,
  fromMinorUnits,
  subtractMinorUnits,
  toMinorUnits,
} from "@minarvabiz/utils";

export interface BiSale {
  date: string;
  total: number;
  cost: number;
  branchId?: string | null;
  staffId?: string | null;
  productId?: string | null;
  productName?: string | null;
}

export interface BiExpense {
  date: string;
  amount: number;
  branchId?: string | null;
  category?: string | null;
}

export interface CashFlowForecastPoint {
  date: string;
  projectedSales: number;
  projectedExpenses: number;
  projectedNetCash: number;
}

export interface BusinessIntelligenceSnapshot {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  estimatedNetProfit: number;
  averageDailyRevenue: number;
  averageDailyExpense: number;
  cashFlowForecast: CashFlowForecastPoint[];
  branchSummaries: Array<{ branchId: string; revenue: number; grossProfit: number; expenses: number; netProfit: number }>;
  productSummaries: Array<{ productId: string; productName: string; revenue: number; grossProfit: number; marginPercent: number }>;
}

function positiveMoneyMinor(value: number): number {
  return Math.max(0, toMinorUnits(Number.isFinite(value) ? value : 0));
}

function dateKey(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function addDays(input: Date, days: number): string {
  const date = new Date(input.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function projectCashFlow(
  sales: BiSale[],
  expenses: BiExpense[],
  forecastDays = 30,
  asOf = new Date(),
): CashFlowForecastPoint[] {
  const days = Math.max(1, forecastDays);
  const salesByDay = new Map<string, number>();
  const expensesByDay = new Map<string, number>();
  for (const sale of sales) {
    const day = dateKey(sale.date);
    if (day) salesByDay.set(day, addMinorUnits(salesByDay.get(day) ?? 0, positiveMoneyMinor(sale.total)));
  }
  for (const expense of expenses) {
    const day = dateKey(expense.date);
    if (day) expensesByDay.set(day, addMinorUnits(expensesByDay.get(day) ?? 0, positiveMoneyMinor(expense.amount)));
  }

  const recentWindowStart = new Date(asOf.getTime() - 30 * 86_400_000);
  let revenueMinor = 0;
  let expenseMinor = 0;
  for (let cursor = new Date(recentWindowStart); cursor <= asOf; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10);
    revenueMinor = addMinorUnits(revenueMinor, salesByDay.get(day) ?? 0);
    expenseMinor = addMinorUnits(expenseMinor, expensesByDay.get(day) ?? 0);
  }
  const avgRevenueMinor = divideMinorUnits(revenueMinor, 31);
  const avgExpenseMinor = divideMinorUnits(expenseMinor, 31);

  return Array.from({ length: days }, (_, index) => ({
    date: addDays(asOf, index + 1),
    projectedSales: fromMinorUnits(avgRevenueMinor),
    projectedExpenses: fromMinorUnits(avgExpenseMinor),
    projectedNetCash: fromMinorUnits(subtractMinorUnits(avgRevenueMinor, avgExpenseMinor)),
  }));
}

export function buildBusinessIntelligence(
  sales: BiSale[],
  expenses: BiExpense[],
  forecastDays = 30,
  asOf = new Date(),
): BusinessIntelligenceSnapshot {
  const revenueMinor = sales.reduce((sum, sale) => addMinorUnits(sum, positiveMoneyMinor(sale.total)), 0);
  const costOfGoodsMinor = sales.reduce((sum, sale) => addMinorUnits(sum, positiveMoneyMinor(sale.cost)), 0);
  const grossProfitMinor = subtractMinorUnits(revenueMinor, costOfGoodsMinor);
  const grossMarginPercent = revenueMinor > 0 ? (grossProfitMinor / revenueMinor) * 100 : 0;
  const operatingExpensesMinor = expenses.reduce((sum, item) => addMinorUnits(sum, positiveMoneyMinor(item.amount)), 0);
  const estimatedNetProfitMinor = subtractMinorUnits(grossProfitMinor, operatingExpensesMinor);

  const days = Math.max(1, Math.ceil((asOf.getTime() - new Date(asOf.getTime() - 30 * 86_400_000).getTime()) / 86_400_000));
  const branchMap = new Map<string, { revenueMinor: number; grossProfitMinor: number; expensesMinor: number }>();
  const productMap = new Map<string, { name: string; revenueMinor: number; grossProfitMinor: number }>();
  for (const sale of sales) {
    const saleRevenueMinor = positiveMoneyMinor(sale.total);
    const saleCostMinor = positiveMoneyMinor(sale.cost);
    const saleGrossMinor = subtractMinorUnits(saleRevenueMinor, saleCostMinor);
    const branchId = sale.branchId ?? "default";
    const branch = branchMap.get(branchId) ?? { revenueMinor: 0, grossProfitMinor: 0, expensesMinor: 0 };
    branch.revenueMinor = addMinorUnits(branch.revenueMinor, saleRevenueMinor);
    branch.grossProfitMinor = addMinorUnits(branch.grossProfitMinor, saleGrossMinor);
    branchMap.set(branchId, branch);
    if (sale.productId) {
      const product = productMap.get(sale.productId) ?? {
        name: sale.productName ?? sale.productId,
        revenueMinor: 0,
        grossProfitMinor: 0,
      };
      product.revenueMinor = addMinorUnits(product.revenueMinor, saleRevenueMinor);
      product.grossProfitMinor = addMinorUnits(product.grossProfitMinor, saleGrossMinor);
      productMap.set(sale.productId, product);
    }
  }
  for (const item of expenses) {
    const branchId = item.branchId ?? "default";
    const branch = branchMap.get(branchId) ?? { revenueMinor: 0, grossProfitMinor: 0, expensesMinor: 0 };
    branch.expensesMinor = addMinorUnits(branch.expensesMinor, positiveMoneyMinor(item.amount));
    branchMap.set(branchId, branch);
  }

  const branchSummaries = [...branchMap.entries()].map(([branchId, item]) => ({
    branchId,
    revenue: fromMinorUnits(item.revenueMinor),
    grossProfit: fromMinorUnits(item.grossProfitMinor),
    expenses: fromMinorUnits(item.expensesMinor),
    netProfit: fromMinorUnits(subtractMinorUnits(item.grossProfitMinor, item.expensesMinor)),
  })).sort((a, b) => b.netProfit - a.netProfit);

  const productSummaries = [...productMap.entries()].map(([productId, item]) => ({
    productId,
    productName: item.name,
    revenue: fromMinorUnits(item.revenueMinor),
    grossProfit: fromMinorUnits(item.grossProfitMinor),
    marginPercent: item.revenueMinor > 0 ? Math.round((item.grossProfitMinor / item.revenueMinor) * 10000) / 100 : 0,
  })).sort((a, b) => b.grossProfit - a.grossProfit);

  return {
    revenue: fromMinorUnits(revenueMinor),
    costOfGoods: fromMinorUnits(costOfGoodsMinor),
    grossProfit: fromMinorUnits(grossProfitMinor),
    grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
    operatingExpenses: fromMinorUnits(operatingExpensesMinor),
    estimatedNetProfit: fromMinorUnits(estimatedNetProfitMinor),
    averageDailyRevenue: fromMinorUnits(divideMinorUnits(revenueMinor, days)),
    averageDailyExpense: fromMinorUnits(divideMinorUnits(operatingExpensesMinor, days)),
    cashFlowForecast: projectCashFlow(sales, expenses, forecastDays, asOf),
    branchSummaries,
    productSummaries,
  };
}
