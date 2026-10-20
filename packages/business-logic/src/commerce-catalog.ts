/**
 * Read-only, seller-initiated export of public-facing Minarva Commerce data.
 * Never serializes purchase costs, supplier details, stock quantities or notes.
 * No storefront publication, inventory availability, price-list authority,
 * transaction creation or network calls occur in this module.
 */
import type { Category, Product } from "@minarvabiz/types";
import { escapeHtml } from "./html";

export type ShareableCatalogProduct = Pick<
  Product,
  | "id" | "name" | "sku" | "barcode" | "categoryId" | "brand"
  | "size" | "color" | "fabric" | "unit" | "sellingPrice"
  | "parentProductId" | "hasVariants" | "isActive" | "deletedAt" | "branchId"
>;

export interface ShareableCatalogOptions {
  /**
   * Not a permission grant. Callers must obtain the verified authorized
   * branch from their trusted session. Omission exports company-wide SKUs
   * only, never records owned by other branches.
   */
  branchId?: string;
}

type VisibleCatalogRow = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  fabric: string;
  unit: string;
  price: string;
  currency: string;
};

const HEADER = "name,sku,barcode,category,brand,size,color,fabric,unit,unit_price,currency";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  // Neutralize spreadsheet formulas, including whitespace-prefixed payloads.
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

/** One shared, deterministic, branch-aware projection for all export formats. */
function visibleCatalogRows(
  products: readonly ShareableCatalogProduct[],
  categories: readonly Pick<Category, "id" | "name" | "isActive" | "deletedAt">[],
  currencyCode: string,
  options: ShareableCatalogOptions,
): VisibleCatalogRow[] {
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error("Configure a valid 3-letter shop currency before exporting a catalog");
  }
  if (options.branchId !== undefined && !options.branchId.trim()) {
    throw new Error("Catalog branch scope must be nonempty");
  }
  const categoriesById = new Map(
    categories.filter((c) => c.isActive && !c.deletedAt).map((c) => [c.id, c.name]),
  );
  // Apply the branch boundary BEFORE deriving parent/variant eligibility.
  // A no-branch caller cannot accidentally publish other-branch stock.
  const active = products.filter((p) =>
    p.isActive &&
    !p.deletedAt &&
    (p.branchId == null || (options.branchId !== undefined && p.branchId === options.branchId)),
  );
  const parentsWithChildren = new Set(
    active.filter((p) => p.parentProductId).map((p) => p.parentProductId!),
  );
  return active
    .filter((p) => !p.hasVariants && !parentsWithChildren.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((p) => {
      if (!p.name.trim()) throw new Error("Product " + p.id + " has no catalog name");
      return {
        name: p.name,
        sku: p.sku ?? "",
        barcode: p.barcode ?? "",
        category: (p.categoryId ? categoriesById.get(p.categoryId) : undefined) ?? "",
        brand: p.brand ?? "",
        size: p.size ?? "",
        color: p.color ?? "",
        fabric: p.fabric ?? "",
        unit: p.unit ?? "",
        price: validPrice(p.sellingPrice, p.id),
        currency: currencyCode,
      };
    });
}

/** Offline-safe, explicit product CSV export; no customers or financial ledger. */
export function exportShareableCatalogCsv(
  products: readonly ShareableCatalogProduct[],
  categories: readonly Pick<Category, "id" | "name" | "isActive" | "deletedAt">[],
  currencyCode: string,
  options: ShareableCatalogOptions = {},
): string {
  const lines = visibleCatalogRows(products, categories, currencyCode, options)
    .map((r) => [
      r.name, r.sku, r.barcode, r.category, r.brand, r.size, r.color,
      r.fabric, r.unit, r.price, r.currency,
    ].map(csvCell).join(","));
  return [HEADER, ...lines].join("\n") + "\n";
}

/**
 * Standalone offline HTML catalog to share as a file or print to PDF.
 * All item/shop fields are escaped, all styling is self-contained, and the
 * restrictive CSP forbids scripts, images, forms, and network resources.
 */
export function exportShareableCatalogHtml(
  products: readonly ShareableCatalogProduct[],
  categories: readonly Pick<Category, "id" | "name" | "isActive" | "deletedAt">[],
  currencyCode: string,
  shopName: string,
  options: ShareableCatalogOptions = {},
): string {
  const rows = visibleCatalogRows(products, categories, currencyCode, options);
  const title = escapeHtml(shopName.trim() || "Product Catalog");
  const cards = rows.map((r) => {
    const meta = [r.category, r.brand, r.size, r.color, r.fabric, r.sku ? "SKU: " + r.sku : ""]
      .filter(Boolean).map((part) => `<span>${escapeHtml(part)}</span>`).join("");
    return `<article class="product"><h2>${escapeHtml(r.name)}</h2><div class="meta">${meta}</div><div class="price">${escapeHtml(r.currency)} ${escapeHtml(r.price)}${r.unit ? ` <small>/ ${escapeHtml(r.unit)}</small>` : ""}</div></article>`;
  }).join("\n");
  const empty = rows.length ? "" : '<p class="empty">No company-wide products are available for this catalog.</p>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>${title} — Product Catalog</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,Arial,sans-serif;margin:0;color:#0f172a;background:#f8fafc}
main{max-width:1000px;margin:0 auto;padding:32px 20px}
h1{font-size:30px;margin:0 0 8px}h2{font-size:18px;margin:0;overflow-wrap:anywhere}
.subtitle,.foot{color:#64748b;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:26px}
.product{background:#fff;border:1px solid #e2e8f0;padding:18px;border-radius:12px;break-inside:avoid}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.meta span{background:#f1f5f9;padding:3px 7px;border-radius:5px;font-size:12px;overflow-wrap:anywhere}
.price{font-weight:800;font-size:21px}.price small{font-weight:400;color:#64748b;font-size:12px}
.foot{border-top:1px solid #e2e8f0;padding-top:14px;margin-top:30px}
@media print{body{background:#fff}main{padding:0}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main>
<header><h1>${title}</h1><p class="subtitle">Product catalog · Regular selling prices</p></header>
<section class="grid" aria-label="Products">${cards}</section>${empty}
<footer class="foot">Prices are indicative. Contact the seller to confirm availability and final terms.</footer>
</main></body></html>`;
}
