import type { Supplier } from "@minarvabiz/types";

/** Shared list/UI guard for positive supplier payables, excluding corrupt stored balances. */
export function hasPayableSupplierBalance(
  supplier: Pick<Supplier, "outstandingBalance">,
): boolean {
  const due = supplier.outstandingBalance;
  return Number.isFinite(due) && due > 0 && Number.isSafeInteger(Math.round(due * 100));
}
