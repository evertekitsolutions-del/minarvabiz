import type { Product, UUID } from "@minarvabiz/types";
import { assertPermission } from "./permissions";
import { createProduct, getProduct, listProducts } from "./store";
import { parseProductVariants, type ProductVariantDraft } from "./product-variant-planner";
import { generateProductBarcode } from "./barcode-labels";

/** One child Product per size/colour/material gives stock, barcode and sale
 * transactions independent identities without adding a second stock ledger. */
export function addProductVariants(parentId: UUID, drafts: readonly ProductVariantDraft[]): Product[] {
  assertPermission("products.manage");
  const parent = getProduct(parentId);
  if (!parent || !parent.hasVariants || parent.parentProductId) throw new Error("Select a variant-group product");
  const existingChildren = listProducts().filter(item => item.parentProductId === parentId && !item.deletedAt);
  const rows = parseProductVariants(drafts.map(item => ({ ...item, brand: item.brand?.trim() || parent.brand || "" })), existingChildren.map(item => ({
    size: item.size || "", color: item.color || "", material: item.fabric || "", brand: item.brand || "",
    sku: item.sku || null, barcode: item.barcode || null,
  })));
  const occupiedSkus = new Set(listProducts().flatMap(item => [item.sku, item.barcode]).filter(Boolean).map(value => String(value).toLowerCase()));
  const occupiedBarcodes = new Set(listProducts().map(item => item.barcode).filter((v): v is string => Boolean(v)));
  const batch = rows.map((row, i) => {
    const sku = row.sku || (parent.sku ? `${parent.sku}-${String(existingChildren.length + i + 1).padStart(2, "0")}` : null);
    if (sku && occupiedSkus.has(sku.toLowerCase())) throw new Error(`Duplicate variant SKU: ${sku}`);
    if (sku) occupiedSkus.add(sku.toLowerCase());
    const barcode = row.barcode || generateProductBarcode([...occupiedBarcodes]);
    if (occupiedBarcodes.has(barcode) || occupiedSkus.has(barcode.toLowerCase()))
      throw new Error(`Duplicate variant barcode: ${barcode}`);
    occupiedSkus.add(barcode.toLowerCase());
    occupiedBarcodes.add(barcode);
    // A variant is a normal saleable product: billing, refunds and warehouse
    // movements already book against this exact Product ID.
    return { ...parent,
      name: `${parent.name} — ${[row.brand, row.size, row.color, row.material].filter(Boolean).join(" / ")}`,
      parentProductId: parent.id,
      hasVariants: false,
      size: row.size || null, color: row.color || null, fabric: row.material || null, brand: row.brand || null,
      sku, barcode, stockQuantity: row.quantity,
    };
  });
  return batch.map(({ id: _id, createdAt: _created, updatedAt: _updated, deletedAt: _deleted, version: _version, ...input }) =>
    createProduct(input));
}

export function createProductVariantFamily(
  input: Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">,
  drafts: readonly ProductVariantDraft[],
): { parent: Product; variants: Product[] } {
  assertPermission("products.manage");
  if (input.parentProductId) throw new Error("Variant group cannot have another parent");
  const rows = parseProductVariants(drafts.map(item => ({ ...item, brand: item.brand?.trim() || input.brand || "" })));
  if (Number(input.stockQuantity) !== 0) throw new Error("Enter stock separately in variant rows; parent opening stock must be zero");
  if (input.sku && listProducts().some(p => p.sku?.toLowerCase() === input.sku?.toLowerCase()))
    throw new Error("Parent SKU already exists");
  // Check all user-supplied identifiers up front, before posting opening stock.
  const taken = new Set(listProducts().flatMap(p => [p.sku, p.barcode]).filter(Boolean).map(v => String(v).toLowerCase()));
  if (input.sku) taken.add(input.sku.toLowerCase());
  for (const [i, row] of rows.entries()) {
    const sku = row.sku || (input.sku ? `${input.sku}-${String(i + 1).padStart(2, "0")}` : null);
    for (const code of [sku, row.barcode]) {
      if (!code) continue;
      if (taken.has(code.toLowerCase())) throw new Error(`Variant ${i + 1}: SKU or barcode already exists`);
      taken.add(code.toLowerCase());
    }
  }
  const parent = createProduct({ ...input, barcode: null, size: null, color: null, fabric: null, stockQuantity: 0, hasVariants: true });
  return { parent, variants: addProductVariants(parent.id, drafts) };
}

