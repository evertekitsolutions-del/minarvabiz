/**
 * PUR-009 — historical posted supplier unit cost comparison.
 *
 * Original, read-only TypeScript interpretation of common Odoo vendor
 * pricelist / ERPNext buying price-history workflows. No upstream code used.
 * Historical posted invoice prices are NOT active vendor rate contracts.
 */
import type { Product, PurchaseInvoice, Supplier } from "@minarvabiz/types";
import { fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";

export interface SupplierCostHistoryRow {
  readonly supplierId: string;
  readonly supplierName: string;
  readonly productId: string;
  readonly sku: string;
  readonly unit: string;
  readonly latestUnitCost: number;
  readonly lowestUnitCost: number;
  readonly highestUnitCost: number;
  readonly premiumToLowestPercent: number;
  readonly observedLines: number;
  readonly lastInvoiceNumber: string;
  readonly lastInvoiceDate: string;
}

const POSTED = new Set(["posted", "partially_paid", "paid"]);
function priceMinor(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid posted supplier unit cost");
  const amount = toMinorUnits(value);
  if (!Number.isSafeInteger(amount) || Math.abs(fromMinorUnits(amount) - value) > 1e-8) {
    throw new Error("Posted supplier unit cost exceeds 0.01 precision");
  }
  return amount;
}
function isoDay(value: string): string {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid posted purchase invoice date");
  }
  return date;
}

/**
 * Compare actual past tax-exclusive invoiced unit costs only. Each selected
 * product must belong to the host-authorized branch. Legacy null branch
 * records are allowed when the customer/supplier is branch-neutral.
 * No procurement approval, contract posting or stock entry is generated.
 */
export function buildPostedSupplierCostComparison(
  product: Pick<Product, "id" | "sku" | "unit" | "branchId" | "deletedAt">,
  suppliers: readonly Supplier[],
  invoices: readonly PurchaseInvoice[],
  branchId: string | null,
): SupplierCostHistoryRow[] {
  if (!product.id || product.deletedAt ||
      (product.branchId != null && product.branchId !== branchId)) {
    throw new Error("Selected product unavailable in authorized branch");
  }
  const available = suppliers.filter(s => !s.deletedAt &&
    (s.branchId == null || s.branchId === branchId));
  const bySupplier = new Map(available.map(s => [s.id, s]));
  if (bySupplier.size !== available.length) throw new Error("Duplicate supplier IDs");

  type Acc = { supplierId: string; supplierName: string;
    latestCost: number; lowest: number; highest: number; count: number;
    latestDate: string; invoiceId: string; invoiceNumber: string };
  const result = new Map<string, Acc>();
  const seenInvoices = new Set<string>();

  for (const invoice of invoices) {
    if (!POSTED.has(invoice.status) || invoice.cancelledAt ||
        (invoice.branchId != null && invoice.branchId !== branchId)) continue;
    if (seenInvoices.has(invoice.id)) throw new Error("Duplicate posted supplier invoice IDs");
    seenInvoices.add(invoice.id);
    const supplier = bySupplier.get(invoice.supplierId);
    if (!supplier) continue;
    const relevant = invoice.lines.filter(l => l.productId === product.id);
    if (!relevant.length) continue;
    const date = isoDay(invoice.invoiceDate);
    const row = result.get(supplier.id) ?? {
      supplierId: supplier.id, supplierName: supplier.name,
      latestCost: 0, lowest: Infinity, highest: -Infinity, count: 0,
      latestDate: "", invoiceId: "", invoiceNumber: "",
    };
    for (const line of relevant) {
      const cost = priceMinor(line.unitCost);
      if (!Number.isFinite(line.invoicedQuantity) ||
          line.invoicedQuantity <= 0) {
        throw new Error("Invalid historical purchase invoice quantity");
      }
      row.count++;
      row.lowest = Math.min(row.lowest, cost);
      row.highest = Math.max(row.highest, cost);
      // Same-day ties are stable; never let network/input array order choose
      // which historical invoice is called 'latest'.
      if (date > row.latestDate || (date === row.latestDate && invoice.id > row.invoiceId)) {
        row.latestDate = date;
        row.invoiceId = invoice.id;
        row.invoiceNumber = invoice.invoiceNumber;
        row.latestCost = cost;
      }
    }
    result.set(supplier.id, row);
  }

  const best = Math.min(...[...result.values()].map(s => s.latestCost));
  return [...result.values()].map((row): SupplierCostHistoryRow => ({
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    productId: product.id,
    sku: product.sku ?? "",
    unit: product.unit,
    latestUnitCost: fromMinorUnits(row.latestCost),
    lowestUnitCost: fromMinorUnits(row.lowest),
    highestUnitCost: fromMinorUnits(row.highest),
    premiumToLowestPercent: best > 0
      ? Math.round(((row.latestCost - best) / best) * 1000) / 10
      : row.latestCost === 0 ? 0 : 100,
    observedLines: row.count,
    lastInvoiceNumber: row.invoiceNumber,
    lastInvoiceDate: row.latestDate,
  })).sort((a, b) =>
    a.latestUnitCost - b.latestUnitCost || a.supplierName.localeCompare(b.supplierName) ||
    a.supplierId.localeCompare(b.supplierId));
}
