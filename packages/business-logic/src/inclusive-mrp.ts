/**
 * SAL-015 — tax-inclusive retail MRP entry for existing EXCLUSIVE-tax
 * Checkout. A manually entered MRP is not a new financial source of truth.
 * It is converted into the existing CartLine.unitPrice before validation,
 * posting, stock debit, returns, printing and offline-sync.
 *
 * Each unit price is representable only to cents. When exact MRP cannot be
 * represented we choose the closest NON-OVERCHARGING inclusive unit total.
 * The actual tax-inclusive unit figure is returned to the UI for disclosure.
 * Applies discount as already configured on the product, after entering MRP.
 */
import { calculateLineItem } from "@minarvabiz/billing";
import {
  fromMinorUnits, toMinorUnits, toPercentBasisPoints,
  toQuantityMilli, QUANTITY_MILLI_FACTOR, multiplyMinorByQuantity,
} from "@minarvabiz/utils";

export interface InclusiveMrpUnitQuote {
  readonly enteredInclusiveMrp: number;
  readonly exclusiveUnitPrice: number;
  readonly effectiveInclusiveUnitPrice: number;
  readonly perUnitRoundingDifference: number;
  readonly taxRatePercent: number;
  readonly quantity: number;
  readonly maxInclusiveLineTotal: number;
  readonly effectiveInclusiveLineTotal: number;
}

export function quoteInclusiveMrpUnitPrice(
  enteredMrp: number, taxRatePercent: number, quantity = 1,
): InclusiveMrpUnitQuote {
  if (!Number.isFinite(enteredMrp) || enteredMrp < 0 ||
      !Number.isFinite(taxRatePercent) || taxRatePercent < 0 ||
      taxRatePercent > 100) {
    throw new Error("MRP and tax rate must be finite, non-negative, and within limits");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Inclusive MRP quantity must be finite and positive");
  }
  const quantityMilli = toQuantityMilli(quantity);
  if (Math.abs(quantityMilli / QUANTITY_MILLI_FACTOR - quantity) > 1e-9) {
    throw new Error("Inclusive MRP quantity exceeds 0.001 precision");
  }
  const mrpMinor = toMinorUnits(enteredMrp);
  if (Math.abs(mrpMinor / 100 - enteredMrp) > 1e-8) {
    throw new Error("Inclusive MRP must have at most two decimal places");
  }
  const maximumLineMinor = multiplyMinorByQuantity(mrpMinor, quantity);
  const rateBps = toPercentBasisPoints(taxRatePercent);
  if (Math.abs(rateBps / 100 - taxRatePercent) > 1e-8) {
    throw new Error("Tax rate must have at most two decimal places");
  }
  // Find the highest 1-cent exclusive base which the existing tax engine
  // values at no more than the entered inclusive MRP. Bisection is exact and
  // bounded (maximum 53 iterations for a safe 64-bit financial amount).
  let low = 0;
  let high = mrpMinor;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    const total = toMinorUnits(calculateLineItem({
      quantity, unitPrice: fromMinorUnits(mid),
      taxRate: taxRatePercent, discountPercent: 0,
    }).total);
    if (total <= maximumLineMinor) low = mid;
    else high = mid - 1;
  }
  if (mrpMinor > 0 && low === 0) {
    throw new Error("Inclusive MRP is too small to represent a positive exclusive unit price");
  }
  const base = fromMinorUnits(low);
  const charged = calculateLineItem({
    quantity: 1, unitPrice: base, taxRate: taxRatePercent,
    discountPercent: 0,
  }).total;
  return {
    enteredInclusiveMrp: enteredMrp,
    exclusiveUnitPrice: base,
    effectiveInclusiveUnitPrice: charged,
    perUnitRoundingDifference: fromMinorUnits(mrpMinor - toMinorUnits(charged)),
    taxRatePercent,
    quantity,
    maxInclusiveLineTotal: fromMinorUnits(maximumLineMinor),
    effectiveInclusiveLineTotal: calculateLineItem({
      quantity, unitPrice: base, taxRate: taxRatePercent, discountPercent: 0,
    }).total,
  };
}
