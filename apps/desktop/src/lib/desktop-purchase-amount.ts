import { validateMoneyAmountInput } from "@minarvabiz/business-logic";

/** Avoid parseFloat prefix coercion before committing purchase and payable accounting. */
export function parseDesktopPurchaseMoney(raw: string, label: string, optional = false): number {
  if (!raw.trim()) {
    if (optional) return 0;
    throw new Error(label + " is required.");
  }
  const result = validateMoneyAmountInput(raw);
  if (!result.ok) throw new Error(label + " must be a non-negative, finite amount with at most two decimals.");
  return result.numeric;
}
