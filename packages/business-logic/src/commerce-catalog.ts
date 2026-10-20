/**
 * Shareable, read-only product catalog projection for Minarva Commerce.
 * Native implementation informed by OSS commerce product-catalog workflows.
 * Never publishes inventory counts, cost, margins, supplier IDs or notes.
 * No anonymous endpoint, reservation or sale authority is introduced here.
 */
import type { Category, Product } from "@minarvabiz/types";

export type ShareableCatalogProduct = Pick<
  Product,
  | "id" | "name" | "sku" | "barcode" | "categoryId" | "brand"
  | "size" | "color" | "fabric" | "unit" | "sellingPrice"
  | "parentProductId" | "hasVariants" | "isActive" | "deletedAt" | "branchId"
>;

export interface ShareableCatalogOptions {
  /** Show branch-owned and company-wide products; do not infer local stock. */
  branchId?: string;
}

const HEADER = "name,sku,barcode,category,brand,size,color,fabric,unit,unit_price,currency";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  // Product fields are untrusted: defend spreadsheets against formula injection.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function validPrice(value: number, productId: string): string {
  const minor = value * 100;
  if (
    !Number.isFinite(value) || value < 0 ||
    !Number.isSafeInteger(Math.round(minor)) ||
    Math.abs(minor - Math.round(minor)) > 0.000001
  ) throw new Error("Invalid catalog unit price for product " + productId);
  return (Math.round(minor) / 100).toFixed(2);
}

/**
 * Explicit seller-initiated CSV download, not a live inventory/API export.
 * Global records without branchId are eligible across branches, but stock
 * availability is intentionally omitted until branch-specific ATP is proven.
 * Price is the regular selling price; never impersonates customer-specific B2B rates.
 */
export function exportShareableCatalogCsv(
  products: readonly ShareableCatalogProduct[],
  categories: readonly Pick<Category, "id" | "name" | "isActive" | "deletedAt">[],
  currencyCode: string,
  options: ShareableCatalogOptions = {},
): string {
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Configure a valid 3-letter shop currency before exporting a catalog");
  }
  const categoriesById = new Map(
    categories.filter((c) => c.isActive && !c.deletedAt).map((c) => [c.id, c.name]),
  );
  const active = products.filter((p) => p.isActive && !p.deletedAt);
  const parentsWithChildren = new Set(
    active.filter((p) => p.parentProductId).map((p) => p.parentProductId!),
  );
  const visible = active
    .filter((p) =>
      !p.hasVariants &&
      !parentsWithChildren.has(p.id) &&
      (options.branchId === undefined || p.branchId == null || p.branchId === options.branchId),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const lines = visible.map((p) => {
    if (!p.name.trim()) throw new Error("Product " + p.id + " has no catalog name");
    return [
      p.name, p.sku, p.barcode, p.categoryId ? categoriesById.get(p.categoryId) : "",
      p.brand, p.size, p.color, p.fabric, p.unit,
      validPrice(p.sellingPrice, p.id), currencyCode,
    ].map(csvCell).join(",");
  });
  return [HEADER, ...lines].join("\n") + "\n";
}
