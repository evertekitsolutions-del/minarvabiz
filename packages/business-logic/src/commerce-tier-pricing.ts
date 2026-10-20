/**
 * Provider-neutral B2B quantity/group/branch price preview.
 *
 * Design reference: Aimeos tier/group pricing and Open Mercato B2B offers.
 * Original Minarva implementation; no PHP, LGPL, GPL or external runtime.
 *
 * Not a price authority: callers must derive group/branch scope from a
 * verified session and reconfirm a versioned price before actual checkout.
 */
import {
  formatMinorUnits, multiplyMinorByQuantity, toMinorUnits, toQuantityMilli,
  QUANTITY_MILLI_FACTOR,
} from "@minarvabiz/utils";
import { validateMoneyAmountInput } from "./service-order-price-draft";

export interface CommercePriceTier {
  id: string;
  productId: string;
  minQuantity: number;
  unitPrice: number;
  branchId?: string | null;
  customerGroupId?: string | null;
}

export interface CommerceTierQuoteInput {
  productId: string;
  baseUnitPrice: number;
  quantity: number;
  currency: string;
  tiers: readonly CommercePriceTier[];
  /** Caller must provide this only after verifying the user's branch grant. */
  branchId?: string | null;
  /** Caller must provide this only after verifying customer group membership. */
  customerGroupId?: string | null;
}

export interface CommerceTierQuote {
  kind: "nonbinding_tier_price_preview";
  productId: string;
  currency: string;
  quantity: number;
  baseUnitPrice: string;
  unitPrice: string;
  lineTotal: string;
  appliedTierId: string | null;
}

function exactMoneyMinor(value: number, label: string): number {
  if (!validateMoneyAmountInput(value).ok) {
    throw new Error(label + " must be a non-negative, exact-cent amount");
  }
  return toMinorUnits(value);
}

function exactQuantityMilli(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(label + " must be a positive quantity");
  }
  let milli: number;
  try {
    milli = toQuantityMilli(value);
  } catch {
    throw new Error(label + " is outside the supported quantity range");
  }
  if (milli <= 0 || Math.abs(milli / QUANTITY_MILLI_FACTOR - value)
    > Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(value)))) {
    throw new Error(label + " must have at most three decimal places");
  }
  return milli;
}

function scopeId(value: string | null | undefined, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(label + " is invalid");
  }
  return value;
}

type EligibleTier = { rule: CommercePriceTier; unitMinor: number; quantityMilli: number; specificity: number };

/**
 * Deterministic policy: group-specific > public, then branch-specific >
 * company-wide, then the highest eligible quantity threshold.
 * Conflicting exact-scope tiers reject the entire quote rather than selecting
 * an arbitrary record. The result cannot be posted to the financial ledger.
 */
export function quoteCommerceTierPrice(input: CommerceTierQuoteInput): CommerceTierQuote {
  if (!input || typeof input.productId !== "string" || !input.productId.trim()) {
    throw new Error("Product ID is required");
  }
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("Price currency must be an uppercase ISO currency code");
  }
  if (!Array.isArray(input.tiers)) throw new Error("Price tiers must be an array");
  const baseMinor = exactMoneyMinor(input.baseUnitPrice, "Base unit price");
  const purchasedQuantityMilli = exactQuantityMilli(input.quantity, "Order quantity");
  const branchId = scopeId(input.branchId, "Branch scope");
  const customerGroupId = scopeId(input.customerGroupId, "Customer group scope");
  const ids = new Set<string>();
  const keys = new Set<string>();
  const eligible: EligibleTier[] = [];

  for (const tier of input.tiers) {
    if (!tier || tier.productId !== input.productId) continue;
    if (typeof tier.id !== "string" || !tier.id.trim() || tier.id !== tier.id.trim()) {
      throw new Error("Tier identity must be nonempty and canonical");
    }
    if (ids.has(tier.id)) throw new Error("Duplicate tier identity");
    ids.add(tier.id);
    const threshold = exactQuantityMilli(tier.minQuantity, "Tier minimum quantity");
    const unitMinor = exactMoneyMinor(tier.unitPrice, "Tier unit price");
    if (unitMinor > baseMinor) throw new Error("Tier price cannot exceed the regular selling price");
    const ruleBranch = scopeId(tier.branchId, "Tier branch scope");
    const ruleGroup = scopeId(tier.customerGroupId, "Tier customer group scope");
    const key = JSON.stringify([ruleBranch, ruleGroup, threshold]);
    if (keys.has(key)) throw new Error("Conflicting price tiers for the same scope and threshold");
    keys.add(key);

    if (threshold > purchasedQuantityMilli ||
      (ruleBranch !== null && ruleBranch !== branchId) ||
      (ruleGroup !== null && ruleGroup !== customerGroupId)) continue;
    eligible.push({
      rule: tier,
      unitMinor,
      quantityMilli: threshold,
      specificity: (ruleGroup === null ? 0 : 2) + (ruleBranch === null ? 0 : 1),
    });
  }
  eligible.sort((a, b) =>
    b.specificity - a.specificity ||
    b.quantityMilli - a.quantityMilli ||
    a.rule.id.localeCompare(b.rule.id)
  );
  const selected = eligible[0] ?? null;
  const unitMinor = selected?.unitMinor ?? baseMinor;
  const lineMinor = multiplyMinorByQuantity(unitMinor, input.quantity);
  return {
    kind: "nonbinding_tier_price_preview",
    productId: input.productId,
    currency: input.currency,
    quantity: input.quantity,
    baseUnitPrice: formatMinorUnits(baseMinor),
    unitPrice: formatMinorUnits(unitMinor),
    lineTotal: formatMinorUnits(lineMinor),
    appliedTierId: selected?.rule.id ?? null,
  };
}
