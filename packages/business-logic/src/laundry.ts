import { roundMoney, subtractMoney } from "@minarvabiz/utils";
export interface LaundryProfitInput { customerRate: number; supplierRate: number; quantity?: number; }
export interface LaundryProfitResult {
  customerRate: number; supplierRate: number; quantity: number;
  unitProfit: number; totalProfit: number; totalCustomerCharge: number; totalSupplierCost: number;
}
export function calculateLaundryProfit(input: LaundryProfitInput): LaundryProfitResult {
  const quantity = input.quantity ?? 1;
  const customerRate = roundMoney(input.customerRate);
  const supplierRate = roundMoney(input.supplierRate);
  const unitProfit = subtractMoney(customerRate, supplierRate);
  return {
    customerRate, supplierRate, quantity, unitProfit,
    totalProfit: roundMoney(unitProfit * quantity),
    totalCustomerCharge: roundMoney(customerRate * quantity),
    totalSupplierCost: roundMoney(supplierRate * quantity),
  };
}
