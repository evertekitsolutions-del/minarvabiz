/**
 * Boutique size/colour/material inventory rows. Each row is a separately
 * stocked and barcoded Product; the parent is a non-saleable catalog grouping.
 */
export type ProductVariantDraft = {
  size: string;
  color: string;
  material: string;
  /** Brand may differ between variants of the same product design. */
  brand?: string;
  quantity: string;
  sku: string;
  barcode: string;
};

export type ProductVariantRow = {
  size: string;
  color: string;
  material: string;
  brand?: string;
  quantity: number;
  sku: string | null;
  barcode: string | null;
};

export const emptyProductVariantDraft = (): ProductVariantDraft => ({
  size: "", color: "", material: "", quantity: "0", sku: "", barcode: "",
});

export function variantIdentity(input: Pick<ProductVariantRow, "size" | "color" | "material">): string {
  return JSON.stringify([input.size, input.color, input.material, input.brand || ""].map(x => x.trim().toLocaleLowerCase("en")));
}

export function parseProductVariants(
  raw: readonly ProductVariantDraft[],
  existing: ReadonlyArray<Pick<ProductVariantRow, "size" | "color" | "material" | "sku" | "barcode">> = [],
): ProductVariantRow[] {
  if (!raw.length) throw new Error("Add at least one size / colour / material stock row");
  if (raw.length > 100) throw new Error("Maximum 100 variants per operation");
  const combinations = new Set(existing.map(variantIdentity));
  const codes = new Set(existing.flatMap(v => [v.sku, v.barcode].filter(Boolean).map(v => String(v).toLowerCase())));
  return raw.map((draft, index) => {
    const size = String(draft.size ?? "").trim();
    const color = String(draft.color ?? "").trim();
    const material = String(draft.material ?? "").trim();
    const brand = String(draft.brand ?? "").trim();
    const sku = String(draft.sku ?? "").trim() || null;
    const barcode = String(draft.barcode ?? "").trim() || null;
    const quantityText = String(draft.quantity ?? "").trim();
    const quantity = Number(quantityText);
    if (![size, color, material, brand].some(Boolean)) throw new Error(`Variant ${index + 1}: enter size, colour, material or brand`);
    if (!/^(?:0|[1-9]\d*)$/.test(quantityText) || !Number.isSafeInteger(quantity))
      throw new Error(`Variant ${index + 1}: quantity must be a whole number of pieces (0 or more)`);
    const key = variantIdentity({ size, color, material, brand });
    if (combinations.has(key)) throw new Error(`Variant ${index + 1}: duplicate size / colour / material combination`);
    combinations.add(key);
    for (const field of [sku, barcode]) {
      if (!field) continue;
      const code = field.toLowerCase();
      if (codes.has(code)) throw new Error(`Variant ${index + 1}: SKU/barcode is duplicated`);
      codes.add(code);
    }
    return { size, color, material, brand, quantity, sku, barcode };
  });
}
