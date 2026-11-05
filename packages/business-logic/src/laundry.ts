import {
  addMinorUnits,
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


/** Conserves cents across a mixed-price garment ticket; legacy uniform pricing remains unchanged. */
export function calculateLaundryTicketTotals(input: {
  mode: "outsourced" | "in_house_ironing";
  quantity: number;
  customerRate: number;
  supplierRate: number;
  items?: readonly { quantity: number; customerRate?: number | null; supplierRate?: number | null }[];
}): Pick<LaundryProfitResult, "totalCustomerCharge" | "totalSupplierCost" | "totalProfit"> {
  const rows = input.items ?? [];
  const hasLineRates = rows.some(row => row.customerRate != null || row.supplierRate != null);
  if (!hasLineRates) {
    return calculateLaundryProfit({
      quantity: input.quantity, customerRate: input.customerRate,
      supplierRate: input.mode === "in_house_ironing" ? 0 : input.supplierRate,
    });
  }
  if (!rows.length || rows.length > 100 || rows.some(row =>
    typeof row.customerRate !== "number" || typeof row.supplierRate !== "number"
    || row.customerRate < 0 || row.supplierRate < 0
    || (input.mode === "in_house_ironing" && row.supplierRate !== 0)
  )) throw new Error("Every garment requires valid customer and supplier rates");
  let quantityMilli = 0, customerMinor = 0, supplierMinor = 0;
  for (const row of rows) {
    quantityMilli += toQuantityMilli(row.quantity);
    if (!Number.isSafeInteger(quantityMilli)) throw new Error("Laundry garment quantity exceeds supported range");
    const line = calculateLaundryProfit({
      quantity: row.quantity, customerRate: row.customerRate!,
      supplierRate: row.supplierRate!,
    });
    customerMinor = addMinorUnits(customerMinor, toMinorUnits(line.totalCustomerCharge));
    supplierMinor = addMinorUnits(supplierMinor, toMinorUnits(line.totalSupplierCost));
  }
  if (quantityMilli !== toQuantityMilli(input.quantity)) throw new Error("Laundry garment quantities do not reconcile");
  return {
    totalCustomerCharge: fromMinorUnits(customerMinor),
    totalSupplierCost: fromMinorUnits(supplierMinor),
    totalProfit: fromMinorUnits(subtractMinorUnits(customerMinor, supplierMinor)),
  };
}
