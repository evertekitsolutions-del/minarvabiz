import type { CartLine, Product } from "@minarvabiz/types";
import { addStockQuantities } from "./inventory";
import {
  dimensionLineMetadataFromMeasurement,
  type DimensionMeasurement,
} from "./dimensional-billing";

/** Area stock is measured in exactly one saleable area unit per SKU. */
export function isAreaBillableProduct(product: Pick<Product, "unit"> | null | undefined): boolean {
  const unit = typeof product?.unit === "string" ? product.unit.trim().toLowerCase() : "";
  return unit === "sqft" || unit === "sqm";
}

/**
 * Apply a deliberate, already-previewed measurement to a fresh cart line.
 * A quantity/metadata pair is never inferred from the cashier's free-text
 * quantity box, and products stocked in pieces/metres cannot sell as area.
 */
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

/**
 * The current NormalBilling cart has one row per product. Two different
 * cuts of the same SKU MUST NOT be silently summed into a single forged
 * dimension invoice. Add separate-row support in a later milestone.
 */
export function appendNormalBillingLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const existing = lines.find(line => line.productId === incoming.productId);
  if (!existing) return [...lines, incoming];
  if (existing.dimensionMetadata != null || incoming.dimensionMetadata != null) {
    throw new Error("Cannot combine area measurements for one product; use a separate measured line");
  }
  const quantity = addStockQuantities(existing.quantity, incoming.quantity);
  const stockQuantity = Math.min(existing.stockQuantity, incoming.stockQuantity);
  if (quantity > stockQuantity) throw new Error("Insufficient stock for combined quantity");
  return lines.map(line => line.productId === incoming.productId
    ? { ...line, quantity, unitPrice: incoming.unitPrice }
    : line
  );
}
