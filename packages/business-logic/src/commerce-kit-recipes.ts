/**
 * Reusable, device-local kit composition drafts (not saleable bundle SKUs).
 * Aimeos kits are a behavioral reference; this is original TypeScript.
 *
 * No stock reservation, financial journal, remote sync, approval or checkout.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import * as store from "./store";
import { getShopProfile } from "./shop-profile";
import { quoteCommerceBundle, type CommerceKitQuote } from "./commerce-bundle-quote";

export interface CommerceKitRecipeComponent {
  readonly productId: string;
  readonly quantityMilliPerKit: number;
}
export interface CommerceKitRecipeDraft {
  readonly id: string;
  readonly name: string;
  readonly draftOnly: true;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly components: readonly CommerceKitRecipeComponent[];
}

const recipes: CommerceKitRecipeDraft[] = [];
const MAX_RECIPES = 500;
const MAX_COMPONENTS = 100;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const recordKeys = new Set(["id", "name", "draftOnly", "version", "createdAt", "updatedAt", "components"]);
const componentKeys = new Set(["productId", "quantityMilliPerKit"]);

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() === value;
}
function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 &&
    name.trim() === name && name.length <= 120;
}

function normalizeComponents(input: unknown, requireUnique = false): CommerceKitRecipeComponent[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_COMPONENTS) {
    throw new Error("Kit recipe requires 1 to 100 components");
  }
  const aggregate = new Map<string, bigint>();
  for (const row of input) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).some((key) => !componentKeys.has(key))) {
      throw new Error("Invalid kit component fields");
    }
    const component = row as Record<string, unknown>;
    const q = component.quantityMilliPerKit;
    if (!validId(component.productId) || typeof q !== "number" ||
        !Number.isSafeInteger(q) || q <= 0) {
      throw new Error("Kit component requires exact positive milli-unit quantity and SKU");
    }
    if (requireUnique && aggregate.has(component.productId)) {
      throw new Error("Duplicate kit SKU in restored recipe");
    }
    const sum = (aggregate.get(component.productId) ?? 0n) + BigInt(q);
    if (sum > MAX_SAFE) throw new Error("Kit quantity overflow");
    aggregate.set(component.productId, sum);
  }
  return [...aggregate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantityMilliPerKit: Number(quantity) }));
}

function validateRecipeRecord(raw: unknown): CommerceKitRecipeDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid kit recipe record");
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some((key) => !recordKeys.has(key))) {
    throw new Error("Kit recipe snapshot cannot inject pricing, tenant or billing authority");
  }
  if (!validId(v.id) || !validName(v.name) || v.draftOnly !== true ||
      typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 1) {
    throw new Error("Invalid kit recipe identity, name or revision");
  }
  for (const key of ["createdAt", "updatedAt"]) {
    const time = v[key];
    if (typeof time !== "string" || !/^\d{4}-\d\d-\d\dT/.test(time) ||
        !Number.isFinite(Date.parse(time))) throw new Error("Invalid kit recipe timestamp");
  }
  return {
    id: v.id, name: v.name, draftOnly: true, version: v.version,
    createdAt: v.createdAt as string, updatedAt: v.updatedAt as string,
    components: normalizeComponents(v.components, true),
  };
}

function verifyCurrentCatalog(components: readonly CommerceKitRecipeComponent[]): void {
  for (const { productId } of components) {
    const p = store.getProduct(productId);
    if (!p || !p.isActive || p.deletedAt || p.branchId != null || p.hasVariants) {
      throw new Error("Kit component must be an active company-wide saleable SKU");
    }
  }
}

export function validateCommerceKitRecipes(input: unknown): CommerceKitRecipeDraft[] {
  if (!Array.isArray(input) || input.length > MAX_RECIPES) {
    throw new Error("Kit recipe snapshot must contain at most 500 records");
  }
  const all = input.map(validateRecipeRecord);
  const ids = new Set<string>();
  for (const recipe of all) {
    if (ids.has(recipe.id)) throw new Error("Duplicate local kit recipe identity");
    ids.add(recipe.id);
  }
  return all;
}

function cloned(recipe: CommerceKitRecipeDraft): CommerceKitRecipeDraft {
  return { ...recipe, components: recipe.components.map((row) => ({ ...row })) };
}
export function listCommerceKitRecipes(): CommerceKitRecipeDraft[] {
  return recipes.map(cloned).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function createCommerceKitRecipe(input: {
  name: string; components: readonly CommerceKitRecipeComponent[];
}): CommerceKitRecipeDraft {
  assertPermission("products.manage");
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => key !== "name" && key !== "components")) {
    throw new Error("Kit recipe creation accepts only a name and component quantities");
  }
  if (!validName(input.name)) throw new Error("Kit recipe name is required (max 120 characters)");
  const components = normalizeComponents(input.components);
  verifyCurrentCatalog(components);
  if (recipes.length >= MAX_RECIPES) throw new Error("Kit recipe limit exceeded");
  const at = nowISO();
  const recipe = validateRecipeRecord({
    id: generateId(), name: input.name, components, draftOnly: true,
    version: 1, createdAt: at, updatedAt: at,
  });
  recipes.push(recipe);
  auditAction("commerce.kit_recipe.create", "commerce_kit_recipe_drafts", recipe.id, null, cloned(recipe));
  touchPersistence();
  return cloned(recipe);
}
export function updateCommerceKitRecipe(
  id: string,
  expectedVersion: number,
  patch: { name: string; components: readonly CommerceKitRecipeComponent[] },
): CommerceKitRecipeDraft {
  assertPermission("products.manage");
  if (!validId(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Valid kit recipe identity and expected revision are required");
  }
  const i = recipes.findIndex((row) => row.id === id);
  if (i < 0) throw new Error("Kit recipe no longer exists");
  const before = recipes[i];
  if (before.version !== expectedVersion) throw new Error("Kit recipe changed; reload before editing");
  if (!patch || Object.keys(patch).some((key) => key !== "name" && key !== "components") ||
      !validName(patch.name)) throw new Error("Only a valid kit name and components may be edited");
  const components = normalizeComponents(patch.components);
  verifyCurrentCatalog(components);
  if (patch.name === before.name && JSON.stringify(components) === JSON.stringify(before.components)) {
    return cloned(before);
  }
  if (before.version >= Number.MAX_SAFE_INTEGER) throw new Error("Kit recipe revision exhausted");
  const next = validateRecipeRecord({
    ...before, name: patch.name, components, version: before.version + 1, updatedAt: nowISO(),
  });
  recipes[i] = next;
  auditAction("commerce.kit_recipe.update", "commerce_kit_recipe_drafts", id, cloned(before), cloned(next));
  touchPersistence();
  return cloned(next);
}
export function deleteCommerceKitRecipe(id: string, expectedVersion: number): boolean {
  assertPermission("products.manage");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Expected kit recipe revision is required");
  }
  const i = recipes.findIndex((item) => item.id === id);
  if (i < 0) return false;
  const before = recipes[i];
  if (before.version !== expectedVersion) throw new Error("Kit recipe changed; reload before deleting");
  recipes.splice(i, 1);
  auditAction("commerce.kit_recipe.delete", "commerce_kit_recipe_drafts", id, cloned(before), null);
  touchPersistence();
  return true;
}

/** Reads LIVE catalog prices; stored recipes intentionally hold no prices. */
export function previewCommerceKitRecipe(id: string, kitCount: number): CommerceKitQuote {
  const recipe = recipes.find((row) => row.id === id);
  if (!recipe) throw new Error("Kit recipe no longer exists");
  const components = recipe.components.map((row) => ({
    productId: row.productId, quantityMilliPerKit: row.quantityMilliPerKit,
  }));
  return quoteCommerceBundle({
    currency: getShopProfile().currency,
    kitCount,
    components,
    products: components.map(({ productId }) => {
      const product = store.getProduct(productId);
      if (!product) throw new Error("Kit SKU no longer exists");
      return {
        id: product.id, name: product.name, sellingPrice: product.sellingPrice,
        unit: product.unit, isActive: product.isActive,
        deletedAt: product.deletedAt ?? null, branchId: product.branchId ?? null,
        hasVariants: product.hasVariants ?? false,
      };
    }),
  });
}
function estimateCsvCell(value: string | number): string {
  const text = String(value);
  // Excel/LibreOffice formulas must not execute from merchant product names.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

/**
 * Explicit seller-initiated CSV estimate for a saved kit composition.
 * No discount/checkout authority, invoice number or tax calculation.
 * Retail amounts are recalculated from current active catalog products.
 */
export function exportCommerceKitEstimateCsv(
  recipeId: string,
  expectedVersion: number,
  kitCount: number,
): string {
  assertPermission("products.manage");
  const recipe = recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error("Kit recipe no longer exists");
  if (!Number.isSafeInteger(expectedVersion) || recipe.version !== expectedVersion) {
    throw new Error("Kit recipe changed; reload before exporting estimate");
  }
  const preview = previewCommerceKitRecipe(recipeId, kitCount);
  const currency = preview.currency;
  const row = (...fields: (string | number)[]) => fields.map(estimateCsvCell).join(",");
  return [
    "record,description,product_id,unit,quantity,unit_price,line_total,currency",
    row("seller", getShopProfile().shopName, "", "", "", "", "", currency),
    row("draft_kit_estimate", recipe.name, "", "", kitCount, "", "", currency),
    ...preview.lines.map((line) => row(
      "component", line.productName, line.productId, line.unit,
      line.quantity, line.unitPrice, line.lineTotal, currency,
    )),
    row("estimate_total", "NONBINDING - NOT AN INVOICE", "", "", kitCount, "", preview.total, currency),
    row("exact_per_kit", "Blank unless the total divides exactly into cents", "", "", "", "", preview.kitTotal, currency),
  ].join("\n") + "\n";
}

export function exportCommerceKitRecipes(): CommerceKitRecipeDraft[] {
  return recipes.map(cloned);
}
export function hydrateCommerceKitRecipes(input: unknown): void {
  const parsed = validateCommerceKitRecipes(input);
  recipes.splice(0, recipes.length, ...parsed);
}
