import type { Customer } from "@minarvabiz/types";

type CollectibleCustomer = Pick<Customer, "id" | "outstandingBalance">;

/** Never trust an incoming customer ID; prefill only from live, unpaid records. */
export function findCollectionCustomer<T extends CollectibleCustomer>(
  customers: readonly T[],
  requestedId: string | null | undefined,
): T | null {
  if (!requestedId) return null;
  return customers.find((customer) =>
    customer.id === requestedId &&
    Number.isFinite(customer.outstandingBalance) &&
    customer.outstandingBalance > 0 &&
    Number.isSafeInteger(Math.round(customer.outstandingBalance * 100))
  ) ?? null;
}

/** Validate a positive two-decimal collection without silently truncating or capping it. */
export function parseCollectionAmount(raw: string, outstandingBalance: number): number {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error("Enter a positive payment amount (up to two decimal places).");
  }
  const amount = Number(value);
  const amountCents = Math.round(amount * 100);
  const dueCents = Math.round(outstandingBalance * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Payment amount must be positive and within the supported range.");
  }
  if (!Number.isFinite(outstandingBalance) || !Number.isSafeInteger(dueCents) || dueCents <= 0) {
    throw new Error("Customer has no valid outstanding balance.");
  }
  if (amountCents > dueCents) {
    throw new Error("Payment amount cannot exceed the customer's outstanding balance.");
  }
  return amountCents / 100;
}
