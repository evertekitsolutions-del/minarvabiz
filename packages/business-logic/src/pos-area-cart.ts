import type { CartLine, Product } from "@minarvabiz/types";
import { QUANTITY_MILLI_FACTOR, toQuantityMilli } from "@minarvabiz/utils";
import { addStockQuantities } from "./inventory";
import { attachNormalAreaMeasurement } from "./normal-area-billing";
import type { DimensionMeasurement } from "./dimensional-billing";

/** A POS cart row identity, not an invoice line or financial transaction ID. */
export function posCartRowKey(line: CartLine): string {
  return line.cartLineId ?? line.productId;
}

function validatedQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid POS quantity");
  }
  const milli = toQuantityMilli(quantity);
  if (Math.abs(milli / QUANTITY_MILLI_FACTOR - quantity) > 1e-9) {
    throw new Error("POS quantity precision exceeds 0.001");
  }
  return milli / QUANTITY_MILLI_FACTOR;
}

/**
 * Check aggregate SKU demand even when every measured cut retains its own row.
 * A single measured line fitting the stock does not authorize a second cut
 * to exceed the shared inventory balance.
 */
function checkProductDemand(
  lines: readonly CartLine[],
  productId: string,
  nextQuantity: number,
  stockQuantity: number,
): void {
  const stock = validatedQuantity(stockQuantity);
  let demand = validatedQuantity(nextQuantity);
  for (const line of lines) {
    if (line.productId !== productId) continue;
    demand = addStockQuantities(demand, validatedQuantity(line.quantity));
  }
  if (demand > stock) throw new Error("Insufficient combined product stock for POS area cuts");
}

/**
 * A measured SKU may have several physically distinct cuts with distinct
 * immutable dimension audits; never merge them into a single quantity.
 */
export function appendPosMeasuredCut(
  lines: CartLine[],
  product: Product,
  measurement: DimensionMeasurement,
  cartLineId: string,
): CartLine[] {
  if (typeof cartLineId !== "string" || !cartLineId.trim() ||
      lines.some(line => posCartRowKey(line) === cartLineId)) {
    throw new Error("Duplicate or invalid POS cart line identity");
  }
  const unmeasured: CartLine = {
    productId: product.id, productName: product.name,
    sku: product.sku, barcode: product.barcode,
    quantity: measurement?.quantity ?? NaN,
    unitPrice: product.sellingPrice, costPrice: product.costPrice,
    discountPercent: product.discount ?? 0,
    taxRate: product.taxRate ?? 0, stockQuantity: product.stockQuantity,
  };
  const line = attachNormalAreaMeasurement(unmeasured, product, measurement);
  checkProductDemand(lines, product.id, line.quantity, product.stockQuantity);
  return [...lines, { ...line, cartLineId }];
}

/** Per-row discount, never every sibling that happens to share a productId. */
export function updatePosCartDiscount(lines: CartLine[], cartLineId: string, discount: number): CartLine[] {
  const safe = Math.min(100, Math.max(0, Number.isFinite(discount) ? discount : 0));
  return lines.map(line => posCartRowKey(line) === cartLineId
    ? { ...line, discountPercent: safe } : line);
}

export function removePosCartRow(lines: CartLine[], cartLineId: string): CartLine[] {
  return lines.filter(line => posCartRowKey(line) !== cartLineId);
}

/** Ordinary quantity editing is still fractional, but area quantities are frozen. */
export function updatePosCartQuantity(
  lines: CartLine[],
  cartLineId: string,
  requested: number,
): CartLine[] {
  const original = lines.find(line => posCartRowKey(line) === cartLineId);
  if (!original || original.dimensionMetadata != null) return lines;
  if (!Number.isFinite(requested)) throw new Error("Invalid POS quantity");
  if (requested <= 0) return removePosCartRow(lines, cartLineId);
  const quantity = validatedQuantity(requested);
  const others = lines.filter(line => posCartRowKey(line) !== cartLineId);
  checkProductDemand(others, original.productId, quantity, original.stockQuantity);
  return lines.map(line => posCartRowKey(line) === cartLineId
    ? { ...line, quantity } : line);
}
