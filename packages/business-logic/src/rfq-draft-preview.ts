/**
 * PUR-002 — offline-safe, read-only Request for Quotation draft.
 * Original Minarva TypeScript workflow inspired by ERPNext/Odoo RFQ concepts.
 * No GPL/LGPL source or runtime dependency is incorporated.
 */
import type { Product, Supplier } from "@minarvabiz/types";

export interface RfqDraftLineInput {
  readonly productId: string;
  readonly quantity: string;
}
export interface RfqDraftInput {
  readonly reference: string;
  readonly supplierIds: readonly string[];
  readonly lines: readonly RfqDraftLineInput[];
  readonly requiredBy: string;
  readonly notes?: string;
}
export interface RfqDraftRow {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly supplierEmail: string;
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly unit: string;
  readonly quantity: number;
}
export interface RfqDraftPreview {
  readonly reference: string;
  readonly requiredBy: string;
  readonly supplierCount: number;
  readonly productCount: number;
  readonly rows: readonly RfqDraftRow[];
  readonly csv: string;
}

const MAX_SUPPLIERS = 25;
const MAX_LINES = 50;
const MAX_ROWS = 1000;
function csvCell(value: string | number): string {
  const valueString = String(value);
  const protectedValue = /^[\s\uFEFF]*[=+\-@\t\r]/u.test(valueString) ? "'" + valueString : valueString;
  return '"' + protectedValue.replace(/"/g, '""') + '"';
}
function dateOnly(value: string): string {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid RFQ required-by date");
  const d = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid RFQ required-by date");
  }
  return value;
}
function quantity(value: string): number {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(normalized)) {
    throw new Error("RFQ quantities require at most three decimals");
  }
  const milli = Math.round(Number(normalized) * 1000);
  if (!Number.isSafeInteger(milli) || milli <= 0) {
    throw new Error("RFQ quantity must be positive and within safe precision");
  }
  return milli / 1000;
}

/** No persistence, messaging or price authority. Input arrays must come from the authorized host. */
export function buildRfqDraftPreview(
  input: RfqDraftInput,
  products: readonly Product[],
  suppliers: readonly Supplier[],
  branchId: string | null,
): RfqDraftPreview {
  const reference = input.reference.trim();
  if (!reference || reference.length > 128 || /[\r\n]/.test(reference)) {
    throw new Error("RFQ reference is required (max 128 characters, one line)");
  }
  const requiredBy = dateOnly(input.requiredBy);
  const notes = (input.notes ?? "").trim();
  if (notes.length > 500) throw new Error("RFQ notes exceed 500 characters");
  if (input.supplierIds.length < 1 || input.supplierIds.length > MAX_SUPPLIERS ||
      input.lines.length < 1 || input.lines.length > MAX_LINES ||
      input.supplierIds.length * input.lines.length > MAX_ROWS) {
    throw new Error("RFQ supports 1–25 suppliers, 1–50 items and up to 1,000 rows");
  }

  const validProducts = products.filter(p =>
    !p.deletedAt && p.isActive && (p.branchId == null || p.branchId === branchId));
  const validSuppliers = suppliers.filter(s =>
    !s.deletedAt && (s.branchId == null || s.branchId === branchId));
  const productsById = new Map(validProducts.map(p => [p.id, p]));
  const suppliersById = new Map(validSuppliers.map(s => [s.id, s]));
  if (productsById.size !== validProducts.length || suppliersById.size !== validSuppliers.length) {
    throw new Error("Duplicate catalog identifiers in RFQ scope");
  }
  const selectedSuppliers: Supplier[] = [];
  const seenSuppliers = new Set<string>();
  for (const id of input.supplierIds) {
    if (seenSuppliers.has(id)) throw new Error("RFQ contains duplicate supplier");
    seenSuppliers.add(id);
    const supplier = suppliersById.get(id);
    if (!supplier) throw new Error("RFQ supplier is missing or not in the active branch");
    selectedSuppliers.push(supplier);
  }

  const selectedLines: Array<{ product: Product; count: number }> = [];
  const seenProducts = new Set<string>();
  for (const line of input.lines) {
    if (seenProducts.has(line.productId)) throw new Error("RFQ contains duplicate product");
    seenProducts.add(line.productId);
    const product = productsById.get(line.productId);
    if (!product) throw new Error("RFQ product is unavailable in the active branch");
    selectedLines.push({ product, count: quantity(line.quantity) });
  }

  const rows: RfqDraftRow[] = [];
  for (const supplier of selectedSuppliers) {
    for (const { product, count } of selectedLines) {
      rows.push({
        supplierId: supplier.id, supplierName: supplier.name, supplierEmail: supplier.email ?? "",
        productId: product.id, sku: product.sku ?? "", productName: product.name,
        unit: product.unit, quantity: count,
      });
    }
  }
  const header = ["RFQ reference", "Required by", "Supplier ID", "Supplier name", "Supplier email",
    "Product ID", "SKU", "Product", "Unit", "Requested quantity", "Notes"];
  const csv = [header, ...rows.map(row => [
    reference, requiredBy, row.supplierId, row.supplierName, row.supplierEmail, row.productId,
    row.sku, row.productName, row.unit, String(row.quantity), notes,
  ])].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return {
    reference, requiredBy, supplierCount: selectedSuppliers.length,
    productCount: selectedLines.length, rows, csv,
  };
}
