import type { Customer } from "@minarvabiz/types";

/** Fail closed on corrupt historic balances; only positive finite dues qualify. */
export function hasOutstandingCustomerBalance(
  customer: Pick<Customer, "outstandingBalance">,
): boolean {
  return Number.isFinite(customer.outstandingBalance) && customer.outstandingBalance > 0;
}
