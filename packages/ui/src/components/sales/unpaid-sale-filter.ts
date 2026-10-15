import type { Sale } from "@minarvabiz/types";

type CollectibleSale = Pick<Sale, "balanceAmount" | "status">;

/** Posted, noncancelled invoices with a finite unpaid receivable. */
export function isUnpaidSale(sale: CollectibleSale): boolean {
  return (sale.status === "completed" || sale.status === "partial") &&
    Number.isFinite(sale.balanceAmount) &&
    sale.balanceAmount > 0 &&
    Number.isSafeInteger(Math.round(sale.balanceAmount * 100));
}


/**
 * Collection is allocated by the customer ledger (oldest open receivables first),
 * not specifically to the invoice on which this action is displayed.
 */
export function canCollectCustomerDueFromSale(
  sale: Pick<Sale, "status" | "balanceAmount" | "customerId">,
): boolean {
  return isUnpaidSale(sale) &&
    typeof sale.customerId === "string" &&
    sale.customerId.trim().length > 0;
}
