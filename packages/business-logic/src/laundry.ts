import {
  fromMinorUnits,
  multiplyMinorByQuantity,
  subtractMinorUnits,
  toMinorUnits,
  toQuantityMilli,
} from "@minarvabiz/utils";

export interface LaundryProfitInput { customerRate: number; supplierRate: number; quantity?: number; }
export interface LaundryProfitResult {
  customerRate: number; supplierRate: number; quantity: number;
  unitProfit: number; totalProfit: number; totalCustomerCharge: number; totalSupplierCost: number;
}

export function calculateLaundryProfit(input: LaundryProfitInput): LaundryProfitResult {
  const quantity = input.quantity ?? 1;
  // Validate/normalize quantity before any money multiplication.
  toQuantityMilli(quantity);

  const customerRateMinor = toMinorUnits(input.customerRate);
  const supplierRateMinor = toMinorUnits(input.supplierRate);
  const unitProfitMinor = subtractMinorUnits(customerRateMinor, supplierRateMinor);
  const totalCustomerMinor = multiplyMinorByQuantity(customerRateMinor, quantity);
  const totalSupplierMinor = multiplyMinorByQuantity(supplierRateMinor, quantity);
  const totalProfitMinor = subtractMinorUnits(totalCustomerMinor, totalSupplierMinor);

  return {
    customerRate: fromMinorUnits(customerRateMinor),
    supplierRate: fromMinorUnits(supplierRateMinor),
    quantity,
    unitProfit: fromMinorUnits(unitProfitMinor),
    totalProfit: fromMinorUnits(totalProfitMinor),
    totalCustomerCharge: fromMinorUnits(totalCustomerMinor),
    totalSupplierCost: fromMinorUnits(totalSupplierMinor),
  };
}
