/** Parse an exact supplier payment, refusing excess amounts instead of silent capping. */
export function parseSupplierPaymentAmount(raw: string, outstanding: number): number {
  const text = raw.trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error("Enter a positive supplier payment amount with at most two decimal places.");
  }
  const amount = Number(text);
  const amountMinor = Math.round(amount * 100);
  const payableMinor = Math.round(outstanding * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Supplier payment amount is not a valid positive monetary amount.");
  }
  if (!Number.isFinite(outstanding) || !Number.isSafeInteger(payableMinor) || payableMinor <= 0) {
    throw new Error("Supplier has no valid outstanding payable balance.");
  }
  if (amountMinor > payableMinor) {
    throw new Error("Supplier payment cannot exceed the current outstanding balance.");
  }
  return amountMinor / 100;
}
