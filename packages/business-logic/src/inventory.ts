/**
 * Inventory stock calculations — pure functions.
 */

import { roundMoney } from "@minarvabiz/utils";

export type StockMovementType =
  | "stock_in"
  | "stock_out"
  | "adjustment"
  | "transfer"
  | "sale"
  | "return"
  | "purchase";

/**
 * Parse user-entered product/stock quantities without silently rounding,
 * truncating fractional units or turning empty/invalid inputs into zero.
 * WMS positions use a maximum of three decimal places.
 */
export function parseNonNegativeStockQuantity(raw: string): number {
  const value = raw.trim();
  if (!/^[0-9]+(?:[.][0-9]{1,3})?$/.test(value)) {
    throw new Error("Stock quantity must be a non-negative number with up to 3 decimal places");
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(Math.round(quantity * 1000))) {
    throw new Error("Stock quantity must be a finite non-negative safe quantity");
  }
  return quantity;
}

/** Apply a movement to current quantity. Returns new quantity. */
export function applyStockMovement(
  currentQty: number,
  type: StockMovementType,
  quantity: number
): number {
  const q = Math.abs(quantity);
  switch (type) {
    case "stock_in":
    case "purchase":
    case "return":
      return currentQty + q;
    case "stock_out":
    case "sale":
      return currentQty - q;
    case "adjustment":
      // quantity is the delta (can be signed) or absolute depending on caller convention
      return currentQty + quantity;
    case "transfer":
      return currentQty - q; // outbound side; inbound is separate stock_in
    default:
      return currentQty;
  }
}

export function isLowStock(quantity: number, minimumStock: number): boolean {
  return quantity <= minimumStock;
}

export function isOutOfStock(quantity: number): boolean {
  return quantity <= 0;
}

export interface InventoryValuationLine {
  productId: string;
  name: string;
  quantity: number;
  costPrice: number;
}

export function inventoryValuation(lines: InventoryValuationLine[]): {
  totalUnits: number;
  totalValue: number;
} {
  let totalUnits = 0;
  let totalValue = 0;
  for (const line of lines) {
    totalUnits += line.quantity;
    totalValue += line.quantity * line.costPrice;
  }
  return { totalUnits, totalValue: roundMoney(totalValue) };
}
