/**
 * Refresh COGS from current product master before posting a sale.
 * Cart prices/discounts are cashier-controlled, but cart costPrice is only a
 * snapshot. A changed/forged cost must not corrupt inventory asset journals.
 * Legacy products lacking a cost field retain the checkout line's basis until
 * their master data is migrated, to keep old saved carts compatible.
 */
export function costSaleLinesFromLiveProducts(
  lines: CartLine[],
  getProduct: (id: UUID) => Product | undefined,
): CartLine[] {
  return lines.map((line) => {
    const currentCost = getProduct(line.productId)?.costPrice;
    return typeof currentCost === "number"
      ? { ...line, costPrice: currentCost }
      : { ...line };
  });
}

/**
 * Final synchronous preflight for POS and Normal Billing checkout.
 * Uses authoritative live product/customer state, not stale cart quantities.
 * Must run before any stock, receivable, payment, journal or outbox mutation.
 */
import type { CartLine, Product, Customer, UUID } from "@minarvabiz/types";
import { validateCart } from "./sales";

export function validateLiveSaleCheckout(
  lines: CartLine[],
  options: {
    allowNegativeStock?: boolean;
    customerId?: UUID | null;
    paidAmount: number;
  },
  getProduct: (id: UUID) => Product | undefined,
  getCustomer: (id: UUID) => Customer | undefined,
): string[] {
  const errors = validateCart(lines, { allowNegativeStock: options.allowNegativeStock });
  const demanded = new Map<string, number>();

  for (const line of lines) {
    const live = getProduct(line.productId);
    if (!live) {
      errors.push(`Product not found: ${line.productName}`);
      continue;
    }
    if (live.isActive === false) errors.push(`${live.name}: product is inactive`);
    if (Number.isFinite(line.quantity) && line.quantity > 0) {
      demanded.set(live.id, (demanded.get(live.id) ?? 0) + line.quantity);
    }
  }
  if (!options.allowNegativeStock) {
    for (const [productId, requested] of demanded) {
      const live = getProduct(productId)!;
      if (!Number.isFinite(requested) || requested > live.stockQuantity) {
        errors.push(`${live.name}: insufficient live stock (requested ${requested}, available ${live.stockQuantity})`);
      }
    }
  }
  if (options.customerId && !getCustomer(options.customerId)) {
    errors.push("Selected customer no longer exists");
  }
  if (!Number.isFinite(options.paidAmount) || options.paidAmount < 0) {
    errors.push("Paid amount must be finite and non-negative");
  }
  return errors;
}
