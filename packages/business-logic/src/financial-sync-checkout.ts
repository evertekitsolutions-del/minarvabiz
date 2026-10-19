/**
 * Capture pre-checkout inventory source proof, without trusting client identity.
 * S2 server authority independently re-verifies branch, device and versions.
 */
import type { Sale, Product, UUID } from "@minarvabiz/types";
import type { FinancialSyncProofV1 } from "./financial-sync-contract";
import { prepareSaleFinancialStockProof } from "./financial-sync-envelope";
import { getActiveBranch } from "./phase9-store";
import { exportWarehouseState } from "./warehouse-store";
import { getShopProfile } from "./shop-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function prepareCheckoutFinancialSource(
  sale: Sale,
  getProduct: (id: UUID) => Product | undefined,
): Omit<FinancialSyncProofV1, "paymentEventIds" | "journalId"> | null {
  const branchId = getActiveBranch()?.id;
  // Legacy branch-hq documents keep their old shape, not invented UUIDs.
  if (!branchId || !UUID_RE.test(branchId)) return null;
  sale.branchId = branchId;
  // Repeated measured cuts of one SKU share one aggregated stock debit and
  // one product/warehouse revision. Distinct item IDs and dimension-line-v1
  // packets stay on the sale; ambiguous multi-location stock still fails closed.
  const productIds = [...new Set(sale.items.map(item => item.productId))];
  if (!productIds.length) return null;
  const products: Product[] = [];
  for (const id of productIds) {
    const product = getProduct(id);
    if (!product || (product.branchId && product.branchId !== branchId)) return null;
    products.push(product);
  }
  return prepareSaleFinancialStockProof({
    sale, products, warehouse: exportWarehouseState(), currencyCode: getShopProfile().currency,
  });
}
