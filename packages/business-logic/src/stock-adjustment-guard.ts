/**
 * Side-effect-free inventory adjustment preflight.
 * Product stock is the accounting truth, WMS locations are an overlay.
 * Do not mutate locations, products, audit or outbox until checks pass.
 */
import type { UUID } from "@minarvabiz/types";
import { applyStockMovement, parseNonNegativeStockQuantity } from "./inventory";
import { warehouseSaleableQuantity } from "./warehouse-store";

export type ManualStockMovement = "stock_in" | "stock_out" | "adjustment";

export function planManualStockAdjustment(
  productId: UUID, branchId: UUID | null | undefined, current: number,
  type: ManualStockMovement, quantity: number,
): { next: number; reduction: number } {
  const next = applyStockMovement(current, type, quantity);
  if (!Number.isFinite(next) || next < -1e-9 || !Number.isSafeInteger(Math.round(next * 1000))) {
    throw new Error("Insufficient stock or unsafe quantity for inventory adjustment");
  }
  const reduction = type === "stock_out" || (type === "adjustment" && quantity < 0)
    ? Math.abs(quantity) : 0;
  if (reduction > 0) {
    const available = warehouseSaleableQuantity(productId, current, branchId ?? null);
    if (reduction > available + 1e-9) {
      throw new Error(`Insufficient unreserved stock for inventory adjustment (requested ${reduction}, saleable ${available}; reserved, in transit or other branch)`);
    }
  }
  return { next: Math.round(next * 1000) / 1000, reduction };
}

export function stockCountDelta(rawTarget: string, current: number, expected: number): number {
  const target = parseNonNegativeStockQuantity(rawTarget);
  if (!Number.isFinite(expected) || Math.abs(current - expected) > 1e-9) {
    throw new Error("Product stock changed while editing. Reopen Adjust Stock to review the latest quantity.");
  }
  return Math.round((target - current) * 1000) / 1000;
}
