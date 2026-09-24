/** Multi-branch performance and transfer intelligence. */

import {
  divideMinorUnits,
  fromMinorUnits,
  subtractMinorUnits,
  toMinorUnits,
} from "@minarvabiz/utils";

export interface BranchMetric {
  branchId: string;
  branchName: string;
  revenue: number;
  cost: number;
  expenses: number;
  orders: number;
  activeOrders: number;
  stockValue: number;
}

export interface BranchComparison {
  branchId: string;
  branchName: string;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPercent: number;
  averageOrderValue: number;
  stockValue: number;
  profitRank: number;
}

function n(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeMoneyMinor(value: number): number {
  return Math.max(0, toMinorUnits(n(value)));
}

export function compareBranches(metrics: BranchMetric[]): BranchComparison[] {
  const rows = metrics.map((branch) => {
    const revenueMinor = nonNegativeMoneyMinor(branch.revenue);
    const costMinor = nonNegativeMoneyMinor(branch.cost);
    const expensesMinor = nonNegativeMoneyMinor(branch.expenses);
    const grossProfitMinor = subtractMinorUnits(revenueMinor, costMinor);
    const netProfitMinor = subtractMinorUnits(grossProfitMinor, expensesMinor);
    return {
      branchId: branch.branchId,
      branchName: branch.branchName,
      revenue: fromMinorUnits(revenueMinor),
      grossProfit: fromMinorUnits(grossProfitMinor),
      netProfit: fromMinorUnits(netProfitMinor),
      grossMarginPercent: revenueMinor > 0 ? Math.round((grossProfitMinor / revenueMinor) * 10000) / 100 : 0,
      averageOrderValue: branch.orders > 0 ? fromMinorUnits(divideMinorUnits(revenueMinor, branch.orders)) : 0,
      stockValue: fromMinorUnits(nonNegativeMoneyMinor(branch.stockValue)),
      profitRank: 0,
    };
  }).sort((a, b) => b.netProfit - a.netProfit || b.revenue - a.revenue);
  rows.forEach((row, index) => { row.profitRank = index + 1; });
  return rows;
}

export function recommendBranchTransfer(
  source: { branchId: string; stock: number; dailyDemand: number },
  target: { branchId: string; stock: number; dailyDemand: number },
  targetCoverageDays = 14,
): { fromBranchId: string; toBranchId: string; quantity: number; reason: string } | null {
  if (source.branchId === target.branchId) return null;
  const demand = Math.max(0, n(target.dailyDemand));
  const targetNeed = Math.max(0, demand * Math.max(1, targetCoverageDays) - Math.max(0, n(target.stock)));
  const sourceSurplus = Math.max(0, Math.max(0, n(source.stock)) - Math.max(0, n(source.dailyDemand)) * 14);
  const quantity = Math.min(targetNeed, sourceSurplus);
  if (quantity <= 0) return null;
  return {
    fromBranchId: source.branchId,
    toBranchId: target.branchId,
    quantity: Math.ceil(quantity * 100) / 100,
    reason: "Rebalance surplus stock toward a higher-demand branch",
  };
}
