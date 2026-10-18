import type { CartLine, Product } from "@minarvabiz/types";
import { addStockQuantities } from "./inventory";
import { QUANTITY_MILLI_FACTOR, toQuantityMilli } from "@minarvabiz/utils";
import {
  dimensionLineMetadataFromMeasurement, parseDimensionLineMetadata,
  type DimensionMeasurement,
} from "./dimensional-billing";

/** Area stock is measured in exactly one saleable area unit per SKU. */
export function isAreaBillableProduct(product: Pick<Product, "unit"> | null | undefined): boolean {
  const unit = typeof product?.unit === "string" ? product.unit.trim().toLowerCase() : "";
  return unit === "sqft" || unit === "sqm";
}

/** Apply a previewed immutable measurement to a new, separately keyed row. */
export function attachNormalAreaMeasurement(
  line: CartLine,
  product: Pick<Product, "unit" | "stockQuantity">,
  measurement: DimensionMeasurement | null | undefined,
): CartLine {
  if (!isAreaBillableProduct(product)) {
    throw new Error("Area billing requires a product stocked in sqft or sqm");
  }
  if (!measurement) throw new Error("Apply a valid area measurement first");
  const metadata = dimensionLineMetadataFromMeasurement(measurement);
  if (metadata.billableUnit !== product.unit.trim().toLowerCase()) {
    throw new Error("Area billable unit must match the product stock unit");
  }
  const quantity = metadata.quantityMilli / 1000;
  if (!Number.isFinite(product.stockQuantity) ||
      quantity > product.stockQuantity) {
    throw new Error("Insufficient area stock for measured quantity");
  }
  return { ...line, quantity, dimensionMetadata: metadata };
}

function keyOf(line: CartLine): string {
  return line.cartLineId ?? line.productId;
}

function preciseQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid cart quantity");
  }
  const milli = toQuantityMilli(value);
  if (Math.abs(milli / QUANTITY_MILLI_FACTOR - value) > 1e-9) {
    throw new Error("Cart quantity must have at most 3 decimals");
  }
  return milli / QUANTITY_MILLI_FACTOR;
}

function validatedLine(line: CartLine): CartLine {
  const quantity = preciseQuantity(line.quantity);
  if (line.dimensionMetadata == null) return { ...line, quantity };
  const milli = toQuantityMilli(quantity);
  return {
    ...line, quantity,
    dimensionMetadata: parseDimensionLineMetadata(line.dimensionMetadata, milli),
  };
}

function checkCombinedStock(lines: CartLine[], productId: string): void {
  const same = lines.filter(line => line.productId === productId);
  if (!same.length) return;
  let total = 0;
  let stock = Number.POSITIVE_INFINITY;
  for (const line of same) {
    total = addStockQuantities(total, preciseQuantity(line.quantity));
    stock = Math.min(stock, line.stockQuantity);
  }
  if (!Number.isFinite(stock) || stock < 0 || total > stock) {
    throw new Error("Insufficient combined stock for measured and ordinary cart quantities");
  }
}

/**
 * Normal Billing allows multiple independent measured cuts of one SKU.
 * Each added cut must have its own distinct row ID and canonical immutable
 * dimension packet. The existing ordinary line for a SKU still aggregates.
 * Every operation preflights the total SKU demand, not each cut alone.
 */
export function appendNormalBillingLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const line = validatedLine(incoming);
  const duplicates = lines.filter(existing => existing.productId === line.productId);
  for (const existing of duplicates) validatedLine(existing);
  if (line.cartLineId !== undefined &&
      (typeof line.cartLineId !== "string" || !line.cartLineId.trim() ||
       lines.some(existing => keyOf(existing) === line.cartLineId) ||
       (line.dimensionMetadata != null && line.cartLineId === line.productId))) {
    throw new Error("Duplicate or invalid cart line identity");
  }

  if (line.dimensionMetadata != null) {
    if (duplicates.length && !line.cartLineId) {
      throw new Error("Separate area measurement requires a distinct cart line identity");
    }
    const result = [...lines, line];
    checkCombinedStock(result, line.productId);
    return result;
  }

  const ordinary = duplicates.find(existing => existing.dimensionMetadata == null);
  if (ordinary) {
    if (line.cartLineId && line.cartLineId !== ordinary.cartLineId) {
      throw new Error("Cannot combine distinct ordinary cart row identities");
    }
    const quantity = addStockQuantities(preciseQuantity(ordinary.quantity), line.quantity);
    const result = lines.map(existing => existing === ordinary
      ? { ...existing, quantity, unitPrice: line.unitPrice }
      : existing);
    checkCombinedStock(result, line.productId);
    return result;
  }

  if (duplicates.some(existing => !existing.cartLineId) && !line.cartLineId) {
    throw new Error("Separate area measurement requires a distinct cart row before adding ordinary stock");
  }
  const result = [...lines, line];
  checkCombinedStock(result, line.productId);
  return result;
}

/** Only rate or ordinary quantity can change; identity/audit cannot. */
export function updateNormalBillingLine(
  lines: CartLine[],
  cartLineId: string,
  patch: Partial<CartLine>,
): CartLine[] {
  const original = lines.find(line => keyOf(line) === cartLineId);
  if (!original) return lines;
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => key !== "quantity" && key !== "unitPrice")) {
    throw new Error("Cart row identity and dimension audit fields are immutable");
  }
  if (Object.hasOwn(patch, "quantity") && original.dimensionMetadata != null) {
    throw new Error("Measured quantity is immutable; remove and remeasure this cut");
  }
  if (Object.hasOwn(patch, "unitPrice") &&
      (typeof patch.unitPrice !== "number" || !Number.isFinite(patch.unitPrice) || patch.unitPrice < 0)) {
    throw new Error("Invalid cart unit price");
  }
  const quantity = Object.hasOwn(patch, "quantity") ? preciseQuantity(patch.quantity!) : original.quantity;
  const result = lines.map(line => keyOf(line) === cartLineId
    ? { ...line, ...patch, quantity } : line);
  checkCombinedStock(result, original.productId);
  return result;
}

/** Removing a cut must never remove another cut with the same productId. */
export function removeNormalBillingLine(lines: CartLine[], cartLineId: string): CartLine[] {
  return lines.filter(line => keyOf(line) !== cartLineId);
}
