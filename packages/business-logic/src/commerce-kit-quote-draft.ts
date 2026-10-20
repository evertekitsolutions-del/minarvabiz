/**
 * Strict seller-entry adapter for read-only physical-kit price previews.
 * No product changes, stock checks, reservation, order or payment are made.
 */
import { toQuantityMilli } from "@minarvabiz/utils";
import {
  quoteCommerceBundle,
  type CommerceKitProduct,
  type CommerceKitQuote,
} from "./commerce-bundle-quote";

export interface CommerceKitQuoteDraft {
  currency: string;
  kitCount: string;
  products: readonly (Omit<CommerceKitProduct, "deletedAt"> & { deletedAt?: string | null })[];
  components: readonly { productId: string; quantityPerKit: string }[];
}

function positiveTextQuantity(text: string, label: string): number {
  if (typeof text !== "string" ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text.trim())) {
    throw new Error(label + " must have no more than three decimal places");
  }
  const quantity = Number(text.trim());
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(label + " must be a positive quantity");
  }
  let milli: number;
  try {
    milli = toQuantityMilli(quantity);
  } catch {
    throw new Error(label + " is outside supported quantity range");
  }
  if (!Number.isSafeInteger(milli) || milli <= 0) {
    throw new Error(label + " is outside supported quantity range");
  }
  return milli;
}

export function parseCommerceKitQuoteDraft(draft: CommerceKitQuoteDraft): CommerceKitQuote {
  if (!draft || typeof draft !== "object" ||
      typeof draft.kitCount !== "string" ||
      !/^[1-9]\d*$/.test(draft.kitCount.trim())) {
    throw new Error("Kit count must be a positive whole number");
  }
  const count = Number(draft.kitCount.trim());
  if (!Number.isSafeInteger(count)) throw new Error("Kit count exceeds supported range");
  if (!Array.isArray(draft.components)) throw new Error("Kit components must be an array");
  const components = draft.components.map((component, index) => ({
    productId: component.productId,
    quantityMilliPerKit: positiveTextQuantity(component.quantityPerKit, "Kit component " + (index + 1) + " quantity"),
  }));
  return quoteCommerceBundle({
    currency: draft.currency,
    kitCount: count,
    // Bridge optional deletion metadata from the Product master without
    // leaking purchase cost, supplier, stock counts or other private fields.
    products: draft.products.map((product) => ({
      id: product.id,
      name: product.name,
      sellingPrice: product.sellingPrice,
      unit: product.unit,
      isActive: product.isActive,
      deletedAt: product.deletedAt ?? null,
      branchId: product.branchId ?? null,
      hasVariants: product.hasVariants ?? false,
    })),
    components,
  });
}
