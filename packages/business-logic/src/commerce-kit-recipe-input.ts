/**
 * Seller text form adapter for local kit recipe drafts.
 * Exact 0.001 unit quantities; creates no stock, invoice or cloud authority.
 */
import { toQuantityMilli } from "@minarvabiz/utils";
import type { CommerceKitRecipeComponent } from "./commerce-kit-recipes";

export interface CommerceKitRecipeInputRow {
  readonly productId: string;
  readonly quantityPerKit: string;
}

/**
 * Rejects imprecise text, exponent notation, missing rows and unsafe integer
 * ranges before reaching the persisted local-only recipe domain.
 * Duplicate SKU rows are intentionally allowed; the domain aggregates them.
 */
export function parseCommerceKitRecipeRows(
  rows: readonly CommerceKitRecipeInputRow[],
): CommerceKitRecipeComponent[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new Error("Kit recipe must have 1 to 100 components");
  }
  return rows.map((row, index) => {
    if (!row || typeof row.productId !== "string" || !row.productId.trim() ||
        row.productId !== row.productId.trim()) {
      throw new Error("Kit component " + (index + 1) + " requires a valid product");
    }
    const input = row.quantityPerKit;
    if (typeof input !== "string" ||
        !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(input.trim())) {
      throw new Error("Kit component " + (index + 1) + " quantity must have at most three decimal places");
    }
    const quantity = Number(input.trim());
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Kit component " + (index + 1) + " quantity must be positive");
    }
    let milli: number;
    try {
      milli = toQuantityMilli(quantity);
    } catch {
      throw new Error("Kit component " + (index + 1) + " quantity exceeds safe range");
    }
    if (!Number.isSafeInteger(milli) || milli <= 0) {
      throw new Error("Kit component " + (index + 1) + " quantity exceeds safe range");
    }
    return { productId: row.productId, quantityMilliPerKit: milli };
  });
}
