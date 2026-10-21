/**
 * INV-018 — non-posting physical count variance review.
 *
 * Original Minarva implementation of a Stock Reconciliation *workflow concept*
 * (ERPNext reference). No upstream source or dependency is incorporated.
 * Preview is derived from the current authorized branch snapshot; it never
 * writes products, stock, accounting journals or outbox messages.
 */
import type { Product } from "@minarvabiz/types";
import { toQuantityMilli } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listProducts } from "./store";

const HEADERS = [
  "Snapshot UTC", "Product ID", "SKU", "Product", "Barcode", "Unit",
  "System quantity", "Counted quantity", "Variance quantity", "Count notes",
] as const;
const MAX_CSV_LENGTH = 5_000_000;
const MAX_PRODUCTS = 20_000;
const MILLI = 1_000;

export interface StockCountVariance {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly bookQuantity: number;
  readonly countedQuantity: number;
  readonly varianceQuantity: number;
  readonly notes: string;
}

export interface StockCountReview {
  readonly snapshotAt: string;
  readonly productCount: number;
  readonly countedCount: number;
  readonly uncountedCount: number;
  readonly discrepancies: readonly StockCountVariance[];
}

/** Strict RFC4180-style CSV cells, including escaped quotes and multiline text. */
function readCsv(csv: string): string[][] {
  if (csv.length > MAX_CSV_LENGTH) throw new Error("Stock count file exceeds 5 MB");
  const input = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, afterQuote = false;
  const cell = () => { row.push(field); field = ""; afterQuote = false; };
  const line = () => {
    cell();
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      throw new Error("Unexpected empty stock count row");
    }
    rows.push(row);
    if (rows.length > MAX_PRODUCTS + 1) throw new Error("Stock count has too many rows");
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else field += c;
    } else if (afterQuote) {
      if (c === ",") cell();
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && input[i + 1] === "\n") i++;
        line();
      } else throw new Error("Invalid character after CSV quoted cell");
    } else if (c === '"') {
      if (field !== "") throw new Error("Invalid CSV quote");
      quoted = true;
    } else if (c === ",") cell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      line();
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field !== "" || row.length || afterQuote) line();
  return rows;
}

function preciseMilli(value: string, allowNegative: boolean): number {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match || (!allowNegative && match[1] === "-")) {
    throw new Error("Count quantities must be non-negative with at most three decimals");
  }
  const result = Number(match[2]) * MILLI +
    Number((match[3] ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Stock count quantity exceeds safe precision");
  return match[1] === "-" ? -result : result;
}

/** Existing exported quantities can contain harmless floating-point residues. */
function bookMilli(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Invalid system stock quantity");
  const milli = toQuantityMilli(value);
  if (!Number.isSafeInteger(milli) || Math.abs(value * MILLI - milli) > 0.000001) {
    throw new Error("Invalid stock quantity precision");
  }
  return milli;
}

/** Checks every row against the current branch's product/quantity snapshot. */
export function reviewStockCountCsv(
  csv: string,
  products: readonly Product[],
): StockCountReview {
  const rows = readCsv(csv);
  if (!rows.length || rows[0].length !== HEADERS.length ||
      HEADERS.some((header, i) => rows[0][i] !== header)) {
    throw new Error("Invalid stock count worksheet header");
  }
  const active = products.filter(p => !p.deletedAt);
  if (active.length > MAX_PRODUCTS) throw new Error("Too many products for stock count review");
  const expected = new Map(active.map(p => [p.id, p]));
  if (expected.size !== active.length) throw new Error("Duplicate product IDs in current inventory");
  if (rows.length !== active.length + 1) {
    throw new Error("Worksheet product list changed; export a new count sheet");
  }

  let snapshotAt = "";
  let countedCount = 0;
  const seen = new Set<string>();
  const discrepancies: StockCountVariance[] = [];
  for (const row of rows.slice(1)) {
    if (row.length !== HEADERS.length) throw new Error("Stock count row has invalid columns");
    const id = row[1];
    if (seen.has(id)) throw new Error("Duplicate product ID in count sheet");
    seen.add(id);
    const product = expected.get(id);
    if (!product) throw new Error("Count sheet includes a missing or foreign-branch product");
    const timestamp = new Date(row[0]);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== row[0]) {
      throw new Error("Invalid count sheet snapshot timestamp");
    }
    if (snapshotAt && snapshotAt !== row[0]) throw new Error("Mixed stock count snapshots");
    snapshotAt = row[0];
    if (row[2] !== (product.sku ?? "") ||
        row[5] !== product.unit ||
        row[4] !== (product.barcode ?? "")) {
      throw new Error("Product identification changed; export a new count sheet");
    }
    const baseline = bookMilli(Number(row[6]));
    const current = bookMilli(product.stockQuantity);
    if (baseline !== current) {
      throw new Error("System stock has changed since count sheet export; re-export before review");
    }
    if (row[7].trim() === "") {
      if (row[8].trim()) throw new Error("Variance entered without a counted quantity");
      continue;
    }
    const counted = preciseMilli(row[7], false);
    const variance = counted - baseline;
    if (!Number.isSafeInteger(variance)) throw new Error("Stock count variance exceeds safe precision");
    if (row[8].trim() && preciseMilli(row[8], true) !== variance) {
      throw new Error("Entered variance does not match counted minus system quantity");
    }
    countedCount++;
    if (variance !== 0) discrepancies.push({
      productId: id,
      sku: product.sku ?? "",
      name: product.name,
      unit: product.unit,
      bookQuantity: baseline / MILLI,
      countedQuantity: counted / MILLI,
      varianceQuantity: variance / MILLI,
      notes: row[9],
    });
  }
  if (!countedCount) throw new Error("Enter at least one physical count in the CSV");
  return {
    snapshotAt,
    productCount: active.length,
    countedCount,
    uncountedCount: active.length - countedCount,
    discrepancies: discrepancies.sort((a, b) => a.name.localeCompare(b.name) ||
      a.productId.localeCompare(b.productId)),
  };
}

/** Host-owned role/branch scope. Never accept a product list from the renderer. */
export function buildAuthorizedStockCountReview(csv: string): StockCountReview {
  assertPermission("inventory.adjust");
  const branch = getActiveBranch();
  return reviewStockCountCsv(csv, listProducts().filter(p =>
    p.branchId == null || (branch != null && p.branchId === branch.id)));
}
