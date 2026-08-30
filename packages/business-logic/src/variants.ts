/**
 * Parent / variant product model for boutique SKUs.
 * Simple products: parentProductId null, hasVariants false.
 * Parent: hasVariants true; children: parentProductId set, own stock/SKU/barcode.
 */
import type { Product, UUID } from "@minarvabiz/types";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import * as store from "./store";

export interface VariantSpec {
  size?: string | null;
  color?: string | null;
  fabric?: string | null;
  brand?: string | null;
  sku?: string | null;
  barcode?: string | null;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock?: number;
}

export function listParentProducts(): Product[] {
  return store.listProducts().filter((p) => !p.parentProductId && (p.hasVariants || true));
}

export function listVariants(parentId: UUID): Product[] {
  return store.listProducts().filter((p) => p.parentProductId === parentId && !p.deletedAt);
}

export function getSellableProducts(): Product[] {
  // POS: variants + simple products without children
  const all = store.listProducts().filter((p) => p.isActive && !p.deletedAt);
  const parentsWithKids = new Set(all.filter((p) => p.parentProductId).map((p) => p.parentProductId!));
  return all.filter((p) => {
    if (p.parentProductId) return true; // is a variant
    if (parentsWithKids.has(p.id) || p.hasVariants) return false; // parent shell — sell variants
    return true;
  });
}

export function createParentWithVariants(
  parent: { name: string; categoryId?: UUID | null; unit?: string },
  variants: VariantSpec[]
): { parent: Product; variants: Product[]; errors: string[] } {
  assertPermission("products.manage");
  if (!variants.length) return { parent: null as never, variants: [], errors: ["Add at least one variant"] };
  const barcodes = variants.map((v) => v.barcode).filter(Boolean);
  if (new Set(barcodes).size !== barcodes.length) {
    return { parent: null as never, variants: [], errors: ["Duplicate barcodes in variants"] };
  }
  const parentProd = store.createProduct({
    name: parent.name,
    categoryId: parent.categoryId ?? null,
    unit: parent.unit || "pcs",
    costPrice: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    minimumStock: 0,
    isActive: true,
    hasVariants: true,
    parentProductId: null,
  } as never);
  // mark hasVariants if createProduct doesn't accept extra fields
  const p = store.getProduct(parentProd.id);
  if (p) {
    (p as Product).hasVariants = true;
  }
  const created: Product[] = [];
  for (const v of variants) {
    const child = store.createProduct({
      name: `${parent.name}${v.size || v.color ? ` (${[v.size, v.color].filter(Boolean).join("/")})` : ""}`,
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      categoryId: parent.categoryId ?? null,
      brand: v.brand ?? null,
      size: v.size ?? null,
      color: v.color ?? null,
      unit: parent.unit || "pcs",
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice,
      stockQuantity: v.stockQuantity,
      minimumStock: v.minimumStock ?? 0,
      isActive: true,
      parentProductId: parentProd.id,
      hasVariants: false,
    } as never);
    const c = store.getProduct(child.id);
    if (c) {
      (c as Product).parentProductId = parentProd.id;
      (c as Product).fabric = v.fabric ?? null;
      (c as Product).size = v.size ?? null;
      (c as Product).color = v.color ?? null;
    }
    created.push(child);
    enqueueOutbox("products", child.id, "insert", child);
  }
  touchPersistence();
  return { parent: parentProd, variants: created, errors: [] };
}

export function findByBarcodeOrSku(code: string): Product | undefined {
  const q = code.trim();
  if (!q) return undefined;
  return getSellableProducts().find(
    (p) => p.barcode === q || p.sku === q || p.barcode?.endsWith(q)
  );
}

export function variantLabel(p: Product): string {
  const bits = [p.size, p.color, p.fabric].filter(Boolean);
  return bits.length ? `${p.name} · ${bits.join(" / ")}` : p.name;
}
