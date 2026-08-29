import { roundMoney, percentOf } from "@minarvabiz/utils";
export type IncentiveRuleType = "fixed" | "percentage";
export interface IncentiveRule { type: IncentiveRuleType; value: number; serviceType?: string; }
export function calculateIncentive(orderValue: number, rule: IncentiveRule): number {
  return rule.type === "fixed" ? roundMoney(rule.value) : percentOf(orderValue, rule.value);
}
export function calculateIncentivesForOrders(
  orders: Array<{ value: number; serviceType?: string }>, rules: IncentiveRule[]
): number {
  let total = 0;
  for (const order of orders) {
    const applicable = rules.find((r) => !r.serviceType || r.serviceType === order.serviceType);
    if (applicable) total += calculateIncentive(order.value, applicable);
  }
  return roundMoney(total);
}
