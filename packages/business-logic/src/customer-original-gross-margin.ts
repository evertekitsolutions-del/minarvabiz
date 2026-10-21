/**
 * FIN-025 — internal customer-wise ORIGINAL posted-invoice gross margin.
 * This is not final customer P&L: later returns, refunds, service expenses,
 * general overhead and credit adjustments are intentionally not allocated.
 * Every figure uses the historic line cost in the posted invoice snapshot.
 */
import type { Sale } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";
import { calculateOriginalInvoiceGrossProfit } from "./invoice-gross-profit";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listCustomers, listSales } from "./store";

export interface CustomerOriginalGrossMarginRow {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  revenueExcludingTax: number;
  historicalCost: number;
  originalGrossProfit: number;
  originalGrossMarginPercent: number;
}

function validDateKey(input: string | undefined): string | null {
  if (input === undefined || input === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error("Invalid gross-margin report date");
  const date = new Date(input + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new Error("Invalid gross-margin report date");
  }
  return input;
}

/** Pure reporting across an already-trusted, scoped, posted sales collection. */
export function calculateCustomerOriginalGrossMargins(
  sales: readonly Sale[],
  names: ReadonlyMap<string, string>,
  from?: string, to?: string,
): CustomerOriginalGrossMarginRow[] {
  const start = validDateKey(from);
  const end = validDateKey(to);
  if (start && end && start > end) throw new Error("Report start date exceeds end date");
  const groups = new Map<string, {
    name: string; count: number; revenue: number; cost: number; gross: number;
  }>();
  for (const sale of sales) {
    if (!sale.customerId || sale.deletedAt || !["completed", "partial"].includes(sale.status)) continue;
    if (typeof sale.saleDate !== "string" || sale.saleDate.length < 10) {
      throw new Error("Posted invoice date is missing");
    }
    const key = sale.saleDate.slice(0, 10);
    if (start && key < start || end && key > end) continue;
    const result = calculateOriginalInvoiceGrossProfit(sale);
    const current = groups.get(sale.customerId) ?? {
      name: names.get(sale.customerId) || sale.customerName || sale.customerId,
      count: 0, revenue: 0, cost: 0, gross: 0,
    };
    current.count += 1;
    current.revenue = addMinorUnits(current.revenue, toMinorUnits(result.revenueExcludingTax));
    current.cost = addMinorUnits(current.cost, toMinorUnits(result.historicalCostOfGoods));
    current.gross = addMinorUnits(current.gross, toMinorUnits(result.grossProfit));
    groups.set(sale.customerId, current);
  }
  return [...groups].map(([customerId, data]) => ({
    customerId,
    customerName: data.name,
    invoiceCount: data.count,
    revenueExcludingTax: fromMinorUnits(data.revenue),
    historicalCost: fromMinorUnits(data.cost),
    originalGrossProfit: fromMinorUnits(data.gross),
    originalGrossMarginPercent: data.revenue === 0
      ? 0 : Math.round(data.gross / data.revenue * 10000) / 100,
  })).sort((a,b) => b.originalGrossProfit - a.originalGrossProfit ||
    a.customerName.localeCompare(b.customerName) || a.customerId.localeCompare(b.customerId));
}

/**
 * Trust boundary. Never receive org/branch/user authority from a browser.
 * Enforces accounting permission before reading potentially sensitive costs.
 */
export function listAuthorizedCustomerOriginalGrossMargins(
  from?: string, to?: string,
): CustomerOriginalGrossMarginRow[] {
  assertPermission("accounting.view");
  const branch = getActiveBranch();
  const filteredSales = listSales().filter((sale) =>
    sale.branchId == null || (branch != null && sale.branchId === branch.id));
  const names = new Map(listCustomers()
    .filter(customer => customer.branchId == null ||
      (branch != null && customer.branchId === branch.id))
    .map(customer => [customer.id, customer.name]));
  return calculateCustomerOriginalGrossMargins(filteredSales, names, from, to);
}
