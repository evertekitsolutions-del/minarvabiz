/**
 * Sales summary movement values use the original invoice and event-dated
 * returns. In-place partial returns reduce Sale.total but leave original
 * Sale.items/cost/tax intact, so a snapshot-only calculation is incorrect.
 * This is an operational report; the posted general ledger remains the
 * accounting authority.
 */
import type { Sale, SaleReturn } from "@minarvabiz/types";
import { calculateLineItem } from "@minarvabiz/billing";
import { addMinorUnits, fromMinorUnits, multiplyMinorByQuantity, subtractMinorUnits, toMinorUnits } from "@minarvabiz/utils";

const cents = (value: number): number => toMinorUnits(value);
function portion(valueMinor: number, part: number, whole: number): number {
  if (whole <= 0 || part < 0 || !Number.isFinite(part)) throw new Error("Invalid historical return allocation");
  return Math.round(valueMinor * part / whole);
}

/** Report the original untaxed revenue/COGS on sale date, then the net
 * reversal on each completed return's date, including returns from older
 * invoices. Non-restocked returned merchandise retains its COGS. */
export function calculateRetailReportMovement(
  sales: readonly Sale[],
  history: readonly SaleReturn[],
  inRange: (date: string) => boolean,
): { productSales: number; inventoryCogs: number } {
  const eligible = sales.filter(s => !s.deletedAt && !["draft", "cancelled"].includes(s.status));
  const bySale = new Map(eligible.map(s => [s.id, s]));
  const complete = history.filter(r => r.status === "completed" && bySale.has(r.saleId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const totalReturned = new Map<string, number>();
  for (const ret of complete) {
    totalReturned.set(ret.saleId, addMinorUnits(totalReturned.get(ret.saleId) ?? 0, cents(ret.totalRefund)));
  }

  let revenueMinor = 0;
  let cogsMinor = 0;
  for (const sale of eligible) {
    if (!inRange(sale.saleDate)) continue;
    const originalGross = addMinorUnits(cents(sale.total), totalReturned.get(sale.id) ?? 0);
    revenueMinor = addMinorUnits(revenueMinor, subtractMinorUnits(originalGross, cents(sale.taxAmount)));
    for (const line of sale.items) {
      cogsMinor = addMinorUnits(cogsMinor, multiplyMinorByQuantity(cents(line.costPrice), line.quantity));
    }
  }

  const returnedValueByItem = new Map<string, number>();
  const restockedQtyByItem = new Map<string, number>();
  for (const ret of complete) {
    const sale = bySale.get(ret.saleId)!;
    let restoredCostMinor = 0;
    let creditedTaxMinor = 0;
    for (const item of ret.items) {
      const original = sale.items.find(row => row.id === item.saleItemId);
      if (!original) throw new Error("Return references an unavailable original sale line");
      const key = `${ret.saleId}:${original.id}`;
      const lineTotals = calculateLineItem(original);
      const lineGrossMinor = cents(original.lineTotal ?? lineTotals.total);
      const originalTaxMinor = cents(lineTotals.taxAmount);
      const priorReturned = returnedValueByItem.get(key) ?? 0;
      const newReturned = addMinorUnits(priorReturned, cents(item.refundAmount));
      if (newReturned > lineGrossMinor) throw new Error("Return exceeds original invoice line value");
      const taxDelta = lineGrossMinor === 0 ? 0 :
        portion(originalTaxMinor, newReturned, lineGrossMinor) -
        portion(originalTaxMinor, priorReturned, lineGrossMinor);
      creditedTaxMinor = addMinorUnits(creditedTaxMinor, taxDelta);
      returnedValueByItem.set(key, newReturned);

      if (item.restock) {
        const before = restockedQtyByItem.get(key) ?? 0;
        const after = before + item.quantity;
        if (!Number.isFinite(after) || after > original.quantity + 1e-9) {
          throw new Error("Restocked return exceeds original sale quantity");
        }
        const originalCostMinor = multiplyMinorByQuantity(cents(original.costPrice), original.quantity);
        restoredCostMinor = addMinorUnits(restoredCostMinor,
          portion(originalCostMinor, after, original.quantity) -
          portion(originalCostMinor, before, original.quantity));
        restockedQtyByItem.set(key, after);
      }
    }
    if (inRange(ret.createdAt)) {
      revenueMinor = subtractMinorUnits(revenueMinor, subtractMinorUnits(cents(ret.totalRefund), creditedTaxMinor));
      cogsMinor = subtractMinorUnits(cogsMinor, restoredCostMinor);
    }
  }
  return { productSales: fromMinorUnits(revenueMinor), inventoryCogs: fromMinorUnits(cogsMinor) };
}
