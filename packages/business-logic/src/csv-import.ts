/** Product CSV import/export with preflight validation and atomic rollback. */
import type { Product } from "@minarvabiz/types";
import * as store from "./store";
import { exportDomainSnapshotFull, importDomainSnapshot } from "./persistence";

export interface ProductCsvRow {
  name: string;
  sku?: string;
  barcode?: string;
  cost?: number;
  price?: number;
  stock?: number;
  min?: number;
  unit?: string;
}

function parseCsvRecord(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  cols.push(current.trim());
  return cols;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportProductsCsv(products: Product[] = store.listProducts()): string {
  const header = ["name", "sku", "barcode", "cost", "price", "stock", "min", "unit"];
  const lines = products.map((p) => [
    p.name,
    p.sku ?? "",
    p.barcode ?? "",
    p.costPrice ?? 0,
    p.sellingPrice ?? 0,
    p.stockQuantity ?? 0,
    p.minimumStock ?? 0,
    p.unit ?? "pcs",
  ].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}

export function parseProductCsv(text: string): {
  rows: ProductCsvRow[];
  errors: string[];
} {
  const source = text.replace(/^\uFEFF/, "").trim();
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["CSV needs header + rows"] };

  let header: string[];
  try {
    header = parseCsvRecord(lines[0]).map((h) => h.toLowerCase().trim());
  } catch (error) {
    return { rows: [], errors: [`Header: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const idx = (name: string) => header.indexOf(name);
  const nameI = idx("name");
  if (nameI < 0) return { rows: [], errors: ["Missing name column"] };

  const rows: ProductCsvRow[] = [];
  const errors: string[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const rowNumber = i + 1;
    let cols: string[];
    try {
      cols = parseCsvRecord(lines[i]);
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const name = cols[nameI]?.trim();
    if (!name) {
      errors.push(`Row ${rowNumber}: empty name`);
      continue;
    }

    const number = (field: string, fallback = 0): number => {
      const pos = idx(field);
      if (pos < 0 || !cols[pos]?.trim()) return fallback;
      const parsed = Number(cols[pos]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push(`Row ${rowNumber}: ${field} must be a finite non-negative number`);
        return fallback;
      }
      return parsed;
    };

    const sku = idx("sku") >= 0 ? cols[idx("sku")]?.trim() || undefined : undefined;
    const barcode = idx("barcode") >= 0 ? cols[idx("barcode")]?.trim() || undefined : undefined;

    if (sku) {
      const key = sku.toLowerCase();
      if (seenSku.has(key)) errors.push(`Row ${rowNumber}: duplicate SKU ${sku} in CSV`);
      seenSku.add(key);
    }
    if (barcode) {
      if (seenBarcode.has(barcode)) errors.push(`Row ${rowNumber}: duplicate barcode ${barcode} in CSV`);
      seenBarcode.add(barcode);
    }

    rows.push({
      name,
      sku,
      barcode,
      cost: number("cost"),
      price: number("price"),
      stock: number("stock"),
      min: number("min"),
      unit: idx("unit") >= 0 ? cols[idx("unit")]?.trim() || "pcs" : "pcs",
    });
  }

  const existing = store.listProducts();
  const existingSku = new Set(existing.map((p) => p.sku?.toLowerCase()).filter(Boolean));
  const existingBarcode = new Set(existing.map((p) => p.barcode).filter(Boolean));
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.sku && existingSku.has(row.sku.toLowerCase())) {
      errors.push(`Row ${rowNumber}: SKU ${row.sku} already exists`);
    }
    if (row.barcode && existingBarcode.has(row.barcode)) {
      errors.push(`Row ${rowNumber}: barcode ${row.barcode} already exists`);
    }
  });

  return { rows, errors };
}

export function importProductsFromCsv(text: string): { created: number; errors: string[] } {
  const { rows, errors } = parseProductCsv(text);
  if (errors.length) return { created: 0, errors };
  if (!rows.length) return { created: 0, errors: ["CSV contains no importable product rows"] };

  const rollback = exportDomainSnapshotFull();
  let created = 0;
  try {
    for (const row of rows) {
      store.createProduct({
        name: row.name,
        sku: row.sku ?? null,
        barcode: row.barcode ?? null,
        unit: row.unit ?? "pcs",
        costPrice: row.cost ?? 0,
        sellingPrice: row.price ?? 0,
        stockQuantity: row.stock ?? 0,
        minimumStock: row.min ?? 0,
        isActive: true,
      } as Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">);
      created += 1;
    }
    return { created, errors: [] };
  } catch (error) {
    const restore = importDomainSnapshot(rollback);
    const message = error instanceof Error ? error.message : String(error);
    return {
      created: 0,
      errors: [
        restore.ok
          ? `Import failed and was rolled back safely: ${message}`
          : `Import failed: ${message}. Rollback failed: ${restore.error}`,
      ],
    };
  }
}
