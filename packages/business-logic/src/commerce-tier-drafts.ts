/**
 * Offline-only draft B2B tier price book.
 *
 * NOT a published customer price list and never used by sales, invoices,
 * purchase orders, checkout or financial/outbox writers. This store persists
 * only in the local encrypted/OS-managed domain snapshot and backup; it has
 * no remote authority until tenant-scoped sync and commercial approvals exist.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import * as store from "./store";
import { getShopProfile } from "./shop-profile";
import { quoteCommerceTierPrice, type CommercePriceTier } from "./commerce-tier-pricing";

export interface CommerceTierDraft extends CommercePriceTier {
  readonly currency: string;
  readonly draftOnly: true;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const drafts: CommerceTierDraft[] = [];
const ALLOWED_KEYS = new Set([
  "id", "productId", "minQuantity", "unitPrice", "currency",
  "draftOnly", "version", "createdAt", "updatedAt",
]);

function validateDraft(candidate: unknown): CommerceTierDraft {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Invalid local B2B price-tier draft");
  }
  const value = candidate as Record<string, unknown>;
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new Error("Draft price tiers cannot contain branch or customer-group authority");
  }
  if (
    typeof value.id !== "string" || !value.id.trim() || value.id !== value.id.trim() ||
    typeof value.productId !== "string" || !value.productId.trim() ||
    value.productId !== value.productId.trim() ||
    value.draftOnly !== true ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
    typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)
  ) throw new Error("Invalid B2B draft identity, revision or currency");
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof value[field] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value[field]) ||
      !Number.isFinite(Date.parse(value[field]))) {
      throw new Error("Invalid B2B draft timestamp");
    }
  }
  // Shared pricing engine is the source of truth for price/quantity precision.
  quoteCommerceTierPrice({
    productId: value.productId as string,
    baseUnitPrice: value.unitPrice as number,
    quantity: value.minQuantity as number,
    currency: value.currency as string,
    tiers: [{
      id: value.id as string,
      productId: value.productId as string,
      minQuantity: value.minQuantity as number,
      unitPrice: value.unitPrice as number,
    }],
  });
  return {
    id: value.id as string,
    productId: value.productId as string,
    minQuantity: value.minQuantity as number,
    unitPrice: value.unitPrice as number,
    currency: value.currency as string,
    draftOnly: true,
    version: value.version as number,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

/** Validates full backup payload before mutating the live draft list. */
export function validateCommerceTierDrafts(input: unknown): CommerceTierDraft[] {
  if (!Array.isArray(input)) throw new Error("B2B price-tier drafts must be an array");
  if (input.length > 5000) throw new Error("B2B price-tier draft limit exceeded");
  const parsed = input.map(validateDraft);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const draft of parsed) {
    if (ids.has(draft.id)) throw new Error("Duplicate B2B price-tier draft ID");
    ids.add(draft.id);
    const key = JSON.stringify([draft.currency, draft.productId, draft.minQuantity]);
    if (keys.has(key)) throw new Error("Conflicting B2B price-tier draft threshold");
    keys.add(key);
  }
  return parsed;
}

export function listCommerceTierDrafts(productId?: string): CommerceTierDraft[] {
  return drafts
    .filter((draft) => productId === undefined || draft.productId === productId)
    .map((draft) => ({ ...draft }))
    .sort((a, b) => a.productId.localeCompare(b.productId) ||
      b.minQuantity - a.minQuantity || a.id.localeCompare(b.id));
}

export function createCommerceTierDraft(input: {
  productId: string;
  minQuantity: number;
  unitPrice: number;
}): CommerceTierDraft {
  assertPermission("products.manage");
  if (!input || typeof input.productId !== "string") {
    throw new Error("Choose a valid product for the local tier draft");
  }
  const product = store.getProduct(input.productId);
  if (!product || !product.isActive || product.deletedAt || product.branchId != null) {
    throw new Error("Only active company-wide products can have local draft tiers");
  }
  const currency = getShopProfile().currency;
  // Validate against the latest *live* product selling price. Drafts have
  // no rights to override catalog pricing or tenant/branch authorities.
  quoteCommerceTierPrice({
    productId: product.id,
    currency,
    baseUnitPrice: product.sellingPrice,
    quantity: input.minQuantity,
    tiers: [{
      id: "new-draft-preview",
      productId: product.id,
      minQuantity: input.minQuantity,
      unitPrice: input.unitPrice,
    }],
  });
  if (drafts.length >= 5000) throw new Error("B2B price-tier draft limit exceeded");
  if (drafts.some((d) => d.productId === product.id &&
      d.currency === currency && d.minQuantity === input.minQuantity)) {
    throw new Error("A local draft already uses this product and quantity threshold");
  }
  const at = nowISO();
  const draft: CommerceTierDraft = validateDraft({
    id: generateId(), productId: product.id,
    minQuantity: input.minQuantity, unitPrice: input.unitPrice,
    currency, draftOnly: true, version: 1, createdAt: at, updatedAt: at,
  });
  drafts.push(draft);
  auditAction("commerce.price_tier_draft.create", "commerce_price_tier_drafts", draft.id, null, { ...draft });
  touchPersistence();
  return { ...draft };
}

export function deleteCommerceTierDraft(id: string, expectedVersion: number): boolean {
  assertPermission("products.manage");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Expected draft revision is required");
  }
  const index = drafts.findIndex((draft) => draft.id === id);
  if (index < 0) return false;
  const existing = drafts[index];
  if (existing.version !== expectedVersion) {
    throw new Error("B2B price-tier draft changed; reload before deleting");
  }
  drafts.splice(index, 1);
  auditAction("commerce.price_tier_draft.delete", "commerce_price_tier_drafts", id, { ...existing }, null);
  touchPersistence();
  return true;
}

export function exportCommerceTierDrafts(): CommerceTierDraft[] {
  return drafts.map((draft) => ({ ...draft }));
}

export function hydrateCommerceTierDrafts(input: unknown): void {
  const parsed = validateCommerceTierDrafts(input);
  drafts.splice(0, drafts.length, ...parsed);
}
