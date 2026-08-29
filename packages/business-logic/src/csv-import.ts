/** Product CSV import */
import type { Product } from "@minarvabiz/types";
import * as store from "./store";

export function parseProductCsv(text: string): {
  rows: Array<{ name: string; sku?: string; barcode?: string; cost?: number; price?: number; stock?: number; min?: number; unit?: string }>;
  errors: string[];
} {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], errors: ["CSV needs header + rows"] };
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const nameI = idx("name");
  if (nameI < 0) return { rows: [], errors: ["Missing name column"] };
  const rows = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols[nameI]) {
      errors.push(`Row ${i + 1}: empty name`);
      continue;
    }
    rows.push({
      name: cols[nameI],
      sku: idx("sku") >= 0 ? cols[idx("sku")] : undefined,
      barcode: idx("barcode") >= 0 ? cols[idx("barcode")] : undefined,
      cost: idx("cost") >= 0 ? parseFloat(cols[idx("cost")]) || 0 : 0,
      price: idx("price") >= 0 ? parseFloat(cols[idx("price")]) || 0 : 0,
      stock: idx("stock") >= 0 ? parseFloat(cols[idx("stock")]) || 0 : 0,
      min: idx("min") >= 0 ? parseFloat(cols[idx("min")]) || 0 : 0,
      unit: idx("unit") >= 0 ? cols[idx("unit")] : "pcs",
    });
  }
  return { rows, errors };
}

export function importProductsFromCsv(text: string): { created: number; errors: string[] } {
  const { rows, errors } = parseProductCsv(text);
  let created = 0;
  for (const r of rows) {
    store.createProduct({
      name: r.name,
      sku: r.sku ?? null,
      barcode: r.barcode ?? null,
      unit: r.unit ?? "pcs",
      costPrice: r.cost ?? 0,
      sellingPrice: r.price ?? 0,
      stockQuantity: r.stock ?? 0,
      minimumStock: r.min ?? 0,
      isActive: true,
    } as Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">);
    created++;
  }
  return { created, errors };
}
