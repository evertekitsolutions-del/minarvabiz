/** Never round, cap or coerce a malformed cashier-entered amount. */
function parseMoney(raw: string, label: string, optional = false): number {
  const value = raw.trim();
  if (value === "" && optional) return 0;
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error(label + " must be a valid non-negative amount with at most two decimal places.");
  }
  const number = Number(value);
  const minor = Math.round(number * 100);
  if (!Number.isFinite(number) || !Number.isSafeInteger(minor)) {
    throw new Error(label + " is outside the supported monetary range.");
  }
  return minor / 100;
}

export function parseExpenseAmount(amount: string): number {
  const value = parseMoney(amount, "Expense amount");
  if (value <= 0) throw new Error("Expense amount must be positive.");
  return value;
}

export function parsePurchaseAmounts(amount: string, paidAmount: string): { amount: number; paidAmount: number } {
  const amountValue = parseMoney(amount, "Purchase amount");
  if (amountValue <= 0) throw new Error("Purchase amount must be positive.");
  const paidValue = parseMoney(paidAmount, "Paid amount", true);
  if (Math.round(paidValue * 100) > Math.round(amountValue * 100)) {
    throw new Error("Paid amount cannot exceed the purchase amount.");
  }
  return { amount: amountValue, paidAmount: paidValue };
}
