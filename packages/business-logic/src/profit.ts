import {
  addMinorUnits,
  fromMinorUnits,
  subtractMinorUnits,
  toMinorUnits,
} from "@minarvabiz/utils";

export interface OrderProfitInput { revenue: number; materialCost: number; orderSpecificExpenses: number; }
export interface OrderProfitResult {
  revenue: number; materialCost: number; orderSpecificExpenses: number;
  totalCost: number; grossProfit: number; profitMarginPercent: number;
}
export function calculateOrderProfit(input: OrderProfitInput): OrderProfitResult {
  const revenueMinor = toMinorUnits(input.revenue);
  const materialCostMinor = toMinorUnits(input.materialCost);
  const orderSpecificExpensesMinor = toMinorUnits(input.orderSpecificExpenses);
  const totalCostMinor = addMinorUnits(materialCostMinor, orderSpecificExpensesMinor);
  const grossProfitMinor = subtractMinorUnits(revenueMinor, totalCostMinor);
  const profitMarginPercent = revenueMinor === 0
    ? 0
    : Math.round((grossProfitMinor / revenueMinor) * 10000) / 100;
  return {
    revenue: fromMinorUnits(revenueMinor),
    materialCost: fromMinorUnits(materialCostMinor),
    orderSpecificExpenses: fromMinorUnits(orderSpecificExpensesMinor),
    totalCost: fromMinorUnits(totalCostMinor),
    grossProfit: fromMinorUnits(grossProfitMinor),
    profitMarginPercent,
  };
}

export interface PeriodSummaryInput {
  productSalesRevenue: number; serviceRevenue: number; inventoryCostOfGoods: number;
  orderMaterialCosts: number; orderSpecificExpenses: number; generalExpenses: number; staffIncentives: number;
}
export interface PeriodSummaryResult {
  totalRevenue: number; totalCostOfGoods: number; grossProfit: number;
  totalOperatingExpenses: number; netProfit: number;
}
export function calculatePeriodSummary(input: PeriodSummaryInput): PeriodSummaryResult {
  const totalRevenueMinor = addMinorUnits(
    toMinorUnits(input.productSalesRevenue),
    toMinorUnits(input.serviceRevenue),
  );
  const totalCostOfGoodsMinor = addMinorUnits(
    toMinorUnits(input.inventoryCostOfGoods),
    toMinorUnits(input.orderMaterialCosts),
  );
  const grossProfitMinor = subtractMinorUnits(totalRevenueMinor, totalCostOfGoodsMinor);
  const totalOperatingExpensesMinor = addMinorUnits(
    toMinorUnits(input.orderSpecificExpenses),
    toMinorUnits(input.generalExpenses),
    toMinorUnits(input.staffIncentives),
  );
  const netProfitMinor = subtractMinorUnits(grossProfitMinor, totalOperatingExpensesMinor);
  return {
    totalRevenue: fromMinorUnits(totalRevenueMinor),
    totalCostOfGoods: fromMinorUnits(totalCostOfGoodsMinor),
    grossProfit: fromMinorUnits(grossProfitMinor),
    totalOperatingExpenses: fromMinorUnits(totalOperatingExpensesMinor),
    netProfit: fromMinorUnits(netProfitMinor),
  };
}
