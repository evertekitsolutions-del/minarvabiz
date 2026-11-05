/** Fail-closed preflight for a direct supplier bill that receives garment
 * stock against the exact child SKU. No inventory, journal or outbox writes. */
import type { PurchaseStockLine, UUID } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, multiplyMinorByQuantity, toMinorUnits, toQuantityMilli } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { planManualStockAdjustment } from "./stock-adjustment-guard";
import { getProduct } from "./store";

export function preflightSupplierStockLines(
  drafts: ReadonlyArray<{ productId: UUID; quantity: number; unitCost: number }> | undefined,
  billAmountMinor: number | null,
  kind: "general" | "order_specific",
  orderId: UUID | null | undefined,
): { lines: PurchaseStockLine[]; errors: string[] } {
  const lines: PurchaseStockLine[] = [], errors: string[] = [];
  if (!drafts?.length) return { lines, errors };
  assertPermission("inventory.adjust");
  if (kind !== "general" || orderId) errors.push("Stock-line intake is only available for general purchases");
  if (drafts.length > 100) errors.push("Maximum 100 stock lines per supplier bill");
  const activeBranch = getActiveBranch()?.id ?? null;
  const projectedStock = new Map<UUID, number>();
  let lineTotalMinor = 0;
  for (const [index, line] of drafts.entries()) {
    try {
      const product = getProduct(line.productId);
      if (!product || !product.isActive || product.hasVariants) throw new Error("Select an active product or individual size/colour variant");
      if (product.branchId && activeBranch && product.branchId !== activeBranch) throw new Error("Product belongs to another branch");
      if (toQuantityMilli(line.quantity) <= 0 || toMinorUnits(line.unitCost) < 0) throw new Error("Quantity must be positive and unit cost non-negative");
      const priceMinor = multiplyMinorByQuantity(toMinorUnits(line.unitCost), line.quantity);
      lineTotalMinor = addMinorUnits(lineTotalMinor, priceMinor);
      const current = projectedStock.get(product.id) ?? product.stockQuantity;
      projectedStock.set(product.id, planManualStockAdjustment(product.id, product.branchId, current, "stock_in", line.quantity).next);
      lines.push({ productId: product.id, quantity: line.quantity, unitCost: line.unitCost, lineTotal: fromMinorUnits(priceMinor) });
    } catch (cause) {
      errors.push(`Stock line ${index + 1}: ${cause instanceof Error ? cause.message : "invalid stock line"}`);
    }
  }
  if (billAmountMinor != null && lineTotalMinor !== billAmountMinor) errors.push("Supplier bill amount must equal the sum of the stock lines");
  return { lines, errors };
}
