import { roundMoney, subtractMoney } from "@minarvabiz/utils";

export interface OrderProfitInput { revenue: number; materialCost: number; orderSpecificExpenses: number; }
export interface OrderProfitResult {
  revenue: number; materialCost: number; orderSpecificExpenses: number;
  totalCost: number; grossProfit: number; profitMarginPercent: number;
}
export function calculateOrderProfit(input: OrderProfitInput): OrderProfitResult {
  const revenue = roundMoney(input.revenue);
  const materialCost = roundMoney(input.materialCost);
  const orderSpecificExpenses = roundMoney(input.orderSpecificExpenses);
  const totalCost = roundMoney(materialCost + orderSpecificExpenses);
  const grossProfit = subtractMoney(revenue, totalCost);
  const profitMarginPercent = revenue === 0 ? 0 : roundMoney((grossProfit / revenue) * 100);
  return { revenue, materialCost, orderSpecificExpenses, totalCost, grossProfit, profitMarginPercent };
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
  const totalRevenue = roundMoney(input.productSalesRevenue + input.serviceRevenue);
  const totalCostOfGoods = roundMoney(input.inventoryCostOfGoods + input.orderMaterialCosts);
  const grossProfit = subtractMoney(totalRevenue, totalCostOfGoods);
  const totalOperatingExpenses = roundMoney(input.orderSpecificExpenses + input.generalExpenses + input.staffIncentives);
  const netProfit = subtractMoney(grossProfit, totalOperatingExpenses);
  return { totalRevenue, totalCostOfGoods, grossProfit, totalOperatingExpenses, netProfit };
}
