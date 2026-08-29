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
