import type { Sale } from "@minarvabiz/types";

type CollectibleSale = Pick<Sale, "balanceAmount" | "status">;

/** Posted, noncancelled invoices with a finite unpaid receivable. */
export function isUnpaidSale(sale: CollectibleSale): boolean {
  return sale.status !== "cancelled" &&
    sale.status !== "returned" &&
    Number.isFinite(sale.balanceAmount) &&
    sale.balanceAmount > 0 &&
    Number.isSafeInteger(Math.round(sale.balanceAmount * 100));
}
