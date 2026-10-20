/**
 * Seller-only, ephemeral B2B quote draft: all inputs are display-only.
 *
 * Inspired by Aimeos quantity pricing and Open Mercato B2B offers; no
 * upstream PHP modules or licenses are bundled. This parser never writes
 * product masters, customer groups, invoices, journals, or an outbox event.
 */
import {
  quoteCommerceTierPrice, type CommerceTierQuote, type CommercePriceTier,
} from "./commerce-tier-pricing";
import { validateMoneyAmountInput } from "./service-order-price-draft";

export interface CommerceQuoteDraft {
  productId: string;
  currency: string;
  baseUnitPrice: number;
  quantity: string;
  /** Optional, one-off wholesale threshold. Not a stored price-list rule. */
  tierMinQuantity: string;
  /** Optional, one-off wholesale unit price. Not a stored price-list rule. */
  tierUnitPrice: string;
}

function positiveDraftQuantity(text: string, label: string): number {
  if (typeof text !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text.trim())) {
    throw new Error(label + " must be a positive number with at most three decimal places");
  }
  const value = Number(text.trim());
  if (!Number.isFinite(value) || value <= 0 ||
      !Number.isSafeInteger(Math.round(value * 1000))) {
    throw new Error(label + " is outside the supported quantity range");
  }
  return value;
}

/**
 * Returns a nonbinding preview. The optional tier exists only for this
 * calculation; it is never saved, applied to sales or granted customer scope.
 */
export function parseCommerceQuoteDraft(
  draft: CommerceQuoteDraft,
  localDraftTiers: readonly CommercePriceTier[] = [],
): CommerceTierQuote {
  if (!draft || typeof draft !== "object") throw new Error("Quote draft is required");
  const quantity = positiveDraftQuantity(draft.quantity, "Order quantity");
  const minText = draft.tierMinQuantity?.trim() ?? "";
  const priceText = draft.tierUnitPrice?.trim() ?? "";
  if (Boolean(minText) !== Boolean(priceText)) {
    throw new Error("Wholesale minimum quantity and unit price must be supplied together");
  }
  const minQuantity = minText ? positiveDraftQuantity(minText, "Wholesale minimum quantity") : null;
  let unitPrice: number | null = null;
  if (priceText) {
    const validated = validateMoneyAmountInput(priceText);
    if (!validated.ok) {
      throw new Error("Wholesale unit price must be a non-negative amount with at most two decimal places");
    }
    unitPrice = validated.numeric;
  }
  return quoteCommerceTierPrice({
    productId: draft.productId,
    baseUnitPrice: draft.baseUnitPrice,
    quantity,
    currency: draft.currency,
    tiers: [
      ...localDraftTiers,
      ...(minQuantity !== null && unitPrice !== null
        ? [{
            id: "one-off-wholesale-preview",
            productId: draft.productId,
            minQuantity,
            unitPrice,
          }]
        : []),
    ],
  });
}
