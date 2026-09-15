/**
 * Deterministic business-intelligence calculations.
 * AI may consume these facts later, but must not replace financial arithmetic.
 */

import { roundMoney } from "@minarvabiz/utils";

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

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
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
    if (day) salesByDay.set(day, (salesByDay.get(day) ?? 0) + positive(sale.total));
  }
  for (const expense of expenses) {
    const day = dateKey(expense.date);
    if (day) expensesByDay.set(day, (expensesByDay.get(day) ?? 0) + positive(expense.amount));
  }

  const recentWindowStart = new Date(asOf.getTime() - 30 * 86_400_000);
  let revenue = 0;
  let expense = 0;
  for (let cursor = new Date(recentWindowStart); cursor <= asOf; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10);
    revenue += salesByDay.get(day) ?? 0;
    expense += expensesByDay.get(day) ?? 0;
  }
  const avgRevenue = revenue / 31;
  const avgExpense = expense / 31;

  return Array.from({ length: days }, (_, index) => {
    const projectedSales = roundMoney(avgRevenue);
    const projectedExpenses = roundMoney(avgExpense);
    return {
      date: addDays(asOf, index + 1),
      projectedSales,
      projectedExpenses,
      projectedNetCash: roundMoney(projectedSales - projectedExpenses),
    };
  });
}

export function buildBusinessIntelligence(
  sales: BiSale[],
  expenses: BiExpense[],
  forecastDays = 30,
  asOf = new Date(),
): BusinessIntelligenceSnapshot {
  const revenue = sales.reduce((sum, sale) => sum + positive(sale.total), 0);
  const costOfGoods = sales.reduce((sum, sale) => sum + positive(sale.cost), 0);
  const grossProfit = revenue - costOfGoods;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const operatingExpenses = expenses.reduce((sum, item) => sum + positive(item.amount), 0);
  const estimatedNetProfit = grossProfit - operatingExpenses;

  const days = Math.max(1, Math.ceil((asOf.getTime() - new Date(asOf.getTime() - 30 * 86_400_000).getTime()) / 86_400_000));
  const branchMap = new Map<string, { revenue: number; grossProfit: number; expenses: number }>();
  const productMap = new Map<string, { name: string; revenue: number; grossProfit: number }>();
  for (const sale of sales) {
    const branchId = sale.branchId ?? "default";
    const branch = branchMap.get(branchId) ?? { revenue: 0, grossProfit: 0, expenses: 0 };
    branch.revenue += positive(sale.total);
    branch.grossProfit += positive(sale.total) - positive(sale.cost);
    branchMap.set(branchId, branch);
    if (sale.productId) {
      const product = productMap.get(sale.productId) ?? { name: sale.productName ?? sale.productId, revenue: 0, grossProfit: 0 };
      product.revenue += positive(sale.total);
      product.grossProfit += positive(sale.total) - positive(sale.cost);
      productMap.set(sale.productId, product);
    }
  }
  for (const item of expenses) {
    const branchId = item.branchId ?? "default";
    const branch = branchMap.get(branchId) ?? { revenue: 0, grossProfit: 0, expenses: 0 };
    branch.expenses += positive(item.amount);
    branchMap.set(branchId, branch);
  }

  const branchSummaries = [...branchMap.entries()].map(([branchId, item]) => ({
    branchId,
    revenue: roundMoney(item.revenue),
    grossProfit: roundMoney(item.grossProfit),
    expenses: roundMoney(item.expenses),
    netProfit: roundMoney(item.grossProfit - item.expenses),
  })).sort((a, b) => b.netProfit - a.netProfit);

  const productSummaries = [...productMap.entries()].map(([productId, item]) => ({
    productId,
    productName: item.name,
    revenue: roundMoney(item.revenue),
    grossProfit: roundMoney(item.grossProfit),
    marginPercent: item.revenue > 0 ? Math.round((item.grossProfit / item.revenue) * 10000) / 100 : 0,
  })).sort((a, b) => b.grossProfit - a.grossProfit);

  return {
    revenue: roundMoney(revenue),
    costOfGoods: roundMoney(costOfGoods),
    grossProfit: roundMoney(grossProfit),
    grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
    operatingExpenses: roundMoney(operatingExpenses),
    estimatedNetProfit: roundMoney(estimatedNetProfit),
    averageDailyRevenue: roundMoney(revenue / days),
    averageDailyExpense: roundMoney(operatingExpenses / days),
    cashFlowForecast: projectCashFlow(sales, expenses, forecastDays, asOf),
    branchSummaries,
    productSummaries,
  };
}
