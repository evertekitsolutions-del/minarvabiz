/**
 * Read-only warehouse stock feasibility for saved, device-local kit recipes.
 * This is NOT a reservation or proof of a committed multi-SKU stock transfer.
 * Final SQLite/PostgreSQL checkout must lock and recheck every SKU atomically.
 */
import { assertPermission } from "./permissions";
import * as productStore from "./store";
import { listCommerceKitRecipes } from "./commerce-kit-recipes";
import {
  preflightCommerceBundleStock,
  type CommerceBundleStockRequirement,
} from "./commerce-bundle-stock";
import type { TrackedLot } from "./tracked-inventory";

export interface CommerceKitRecipeStockRequest {
  readonly recipeId: string;
  /** Version observed when the seller selected the composition. */
  readonly expectedRecipeVersion: number;
  readonly orgId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  readonly kitCount: number;
  /** Verified org/warehouse-scoped warehouse reader's lot snapshot. */
  readonly lots: readonly TrackedLot[];
}

export interface CommerceKitRecipeStockPreview {
  readonly kind: "nonbinding_kit_stock_preview";
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly orgId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  readonly kitCount: number;
  readonly requirements: readonly CommerceBundleStockRequirement[];
}

/**
 * Uses the same trusted local recipe and FEFO planner as Minarva's
 * standalone bundle-stock domain; never edits stock/recipes/outbox.
 * Version guard prevents planning availability for an obsolete kit
 * composition after a concurrent editor changes quantities.
 */
export function preflightCommerceKitRecipeStock(
  request: CommerceKitRecipeStockRequest,
): CommerceKitRecipeStockPreview {
  assertPermission("products.manage");
  if (!request || typeof request.recipeId !== "string" || !request.recipeId.trim() ||
      request.recipeId !== request.recipeId.trim() ||
      !Number.isSafeInteger(request.expectedRecipeVersion) || request.expectedRecipeVersion < 1) {
    throw new Error("Valid kit recipe identity and expected revision are required");
  }
  const recipe = listCommerceKitRecipes().find((r) => r.id === request.recipeId);
  if (!recipe) throw new Error("Kit recipe no longer exists");
  if (recipe.version !== request.expectedRecipeVersion) {
    throw new Error("Kit recipe changed; reload before stock preflight");
  }
  // Even previously saved recipes can become non-saleable after a SKU archive,
  // reclassification, variant conversion or branch reassignment.
  for (const component of recipe.components) {
    const product = productStore.getProduct(component.productId);
    if (!product || !product.isActive || product.deletedAt || product.branchId != null ||
        product.hasVariants) {
      throw new Error("Kit recipe contains a non-saleable or branch-specific SKU");
    }
  }
  const requirements = preflightCommerceBundleStock({
    orgId: request.orgId,
    warehouseId: request.warehouseId,
    asOfDate: request.asOfDate,
    bundleCount: request.kitCount,
    components: recipe.components.map((c) => ({
      productId: c.productId,
      quantityMilliPerBundle: c.quantityMilliPerKit,
    })),
    lots: request.lots,
  });
  return Object.freeze({
    kind: "nonbinding_kit_stock_preview",
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    orgId: request.orgId,
    warehouseId: request.warehouseId,
    asOfDate: request.asOfDate,
    kitCount: request.kitCount,
    requirements,
  });
}
