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
import { addStockQuantities } from "./inventory";
import { validateCart } from "./sales";
import { warehouseSaleableQuantity } from "./warehouse-store";

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
  // The cart's stockQuantity is a snapshot from when the product was added.
  // Replenishment may have happened since then: validate against one coherent
  // live product snapshot, never reject a valid sale solely for stale cart stock.
  // The existing pure validateCart still enforces all other numeric and
  // aggregated-demand checks; the live check below remains fail-closed.
  const productSnapshot = new Map<UUID, Product | undefined>();
  const lookup = (id: UUID): Product | undefined => {
    if (!productSnapshot.has(id)) productSnapshot.set(id, getProduct(id));
    return productSnapshot.get(id);
  };
  const currentLines = lines.map(line => {
    const current = lookup(line.productId);
    return current ? { ...line, stockQuantity: current.stockQuantity } : { ...line };
  });
  const errors = validateCart(currentLines, { allowNegativeStock: options.allowNegativeStock });
  const demanded = new Map<string, number>();

  for (const line of lines) {
    const live = lookup(line.productId);
    if (!live) {
      errors.push(`Product not found: ${line.productName}`);
      continue;
    }
    if (live.isActive === false) errors.push(`${live.name}: product is inactive`);
    if (Number.isFinite(line.quantity) && line.quantity > 0) {
      try {
        demanded.set(live.id, addStockQuantities(demanded.get(live.id) ?? 0, line.quantity));
      } catch {
        errors.push(`${live.name}: quantity exceeds the safe range`);
      }
    }
  }
  // Validate every resulting balance before WMS writes, including explicit
  // negative-stock sales. The override never authorizes non-finite/unsafe data.
  for (const [productId, requested] of demanded) {
    const live = lookup(productId)!;
    let available: number;
    try {
      available = addStockQuantities(live.stockQuantity, 0);
      addStockQuantities(available, -requested);
    } catch {
      errors.push(`${live.name}: live stock quantity is invalid or unsafe`);
      continue;
    }
    if (!options.allowNegativeStock) {
      if (!Number.isFinite(requested) || requested > available) {
        errors.push(`${live.name}: insufficient live stock (requested ${requested}, available ${available})`);
      } else {
        // Protect reserved, dispatched and foreign-branch stock before ANY write.
        const saleable = warehouseSaleableQuantity(productId, live.stockQuantity, live.branchId);
        if (requested > saleable + 1e-9) {
          errors.push(`${live.name}: insufficient unreserved stock (requested ${requested}, saleable ${saleable}; reserved, in transit or allocated to another branch)`);
        }
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
