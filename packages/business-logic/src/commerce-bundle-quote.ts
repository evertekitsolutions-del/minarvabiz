/**
 * Read-only quantity/pricing calculation for physical bundle/kit offers.
 *
 * Aimeos bundle pricing is a design reference, not a dependency or source.
 * No sale, reservation, inventory adjustment or cloud/ledger write occurs.
 * Verified catalog and branch ownership MUST be rechecked at actual checkout.
 */
import {
  addMinorUnits, formatMinorUnits, multiplyMinorByQuantity,
  toMinorUnits, QUANTITY_MILLI_FACTOR,
} from "@minarvabiz/utils";
import { validateMoneyAmountInput } from "./service-order-price-draft";

export interface CommerceKitProduct {
  readonly id: string;
  readonly name: string;
  readonly sellingPrice: number;
  readonly unit: string;
  readonly isActive: boolean;
  readonly deletedAt: string | null;
  readonly branchId?: string | null;
  readonly hasVariants?: boolean;
}

export interface CommerceKitComponent {
  readonly productId: string;
  /** Required amount of this product per single kit in 0.001 units. */
  readonly quantityMilliPerKit: number;
}

export interface CommerceKitQuoteInput {
  readonly currency: string;
  readonly kitCount: number;
  readonly components: readonly CommerceKitComponent[];
  readonly products: readonly CommerceKitProduct[];
}
export interface CommerceKitQuoteLine {
  readonly productId: string;
  readonly productName: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly lineTotal: string;
}
export interface CommerceKitQuote {
  readonly kind: "nonbinding_bundle_price_preview";
  readonly currency: string;
  readonly kitCount: number;
  readonly lines: readonly CommerceKitQuoteLine[];
  readonly kitTotal: string;
  readonly total: string;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const validId = (id: unknown): id is string =>
  typeof id === "string" && Boolean(id.trim()) && id.trim() === id;

/**
 * Duplicate components of the same SKU are added BEFORE money multiplication
 * to avoid rounding one partial component several times. Each SKU line rounds
 * once; total is the exact sum of the individually rounded lines.
 */
export function quoteCommerceBundle(input: CommerceKitQuoteInput): CommerceKitQuote {
  if (!input || !Array.isArray(input.products) || !Array.isArray(input.components)) {
    throw new Error("Bundle quote requires catalog products and components");
  }
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("Bundle currency must be a three-letter uppercase code");
  }
  if (!Number.isSafeInteger(input.kitCount) || input.kitCount <= 0) {
    throw new Error("Kit count must be a positive whole number");
  }
  if (input.components.length === 0 || input.components.length > 1000) {
    throw new Error("Bundle must have 1 to 1000 components");
  }

  const requirements = new Map<string, bigint>();
  for (const component of input.components) {
    if (!component || !validId(component.productId) ||
        !Number.isSafeInteger(component.quantityMilliPerKit) ||
        component.quantityMilliPerKit <= 0) {
      throw new Error("Bundle component requires a SKU and positive exact milli-unit quantity");
    }
    const added = BigInt(component.quantityMilliPerKit) * BigInt(input.kitCount);
    const total = (requirements.get(component.productId) ?? 0n) + added;
    if (total > MAX_SAFE) throw new Error("Bundle quantity exceeds safe numeric range");
    requirements.set(component.productId, total);
  }

  const products = new Map<string, CommerceKitProduct>();
  for (const product of input.products) {
    if (!product || !validId(product.id)) throw new Error("Invalid bundle catalog product");
    if (!requirements.has(product.id)) continue;
    if (products.has(product.id)) throw new Error("Duplicate bundle catalog product ID");
    products.set(product.id, product);
  }

  let totalMinor = 0;
  const lines = [...requirements]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, requiredMilli]) => {
      const product = products.get(productId);
      if (!product || !product.isActive || product.deletedAt ||
          product.branchId != null || product.hasVariants) {
        throw new Error("Bundle SKU unavailable or outside company-wide catalog: " + productId);
      }
      if (typeof product.name !== "string" || !product.name.trim() ||
          typeof product.unit !== "string" || !product.unit.trim()) {
        throw new Error("Bundle catalog product has invalid name or unit");
      }
      if (!validateMoneyAmountInput(product.sellingPrice).ok) {
        throw new Error("Invalid selling price for bundle component " + productId);
      }
      const unitMinor = toMinorUnits(product.sellingPrice);
      const quantity = Number(requiredMilli) / QUANTITY_MILLI_FACTOR;
      const lineMinor = multiplyMinorByQuantity(unitMinor, quantity);
      totalMinor = addMinorUnits(totalMinor, lineMinor);
      return Object.freeze({
        productId,
        productName: product.name,
        unit: product.unit,
        quantity,
        unitPrice: formatMinorUnits(unitMinor),
        lineTotal: formatMinorUnits(lineMinor),
      });
    });
  // The selling price per kit is informational, not an authoritative offer.
  // Represent the per-kit equivalent only when the total divides to cents.
  // Otherwise do not invent a falsely exact per-kit price.
  const roundedKitPrice = totalMinor % input.kitCount === 0
    ? formatMinorUnits(totalMinor / input.kitCount)
    : "";
  return Object.freeze({
    kind: "nonbinding_bundle_price_preview",
    currency: input.currency,
    kitCount: input.kitCount,
    lines: Object.freeze(lines),
    kitTotal: roundedKitPrice,
    total: formatMinorUnits(totalMinor),
  });
}
