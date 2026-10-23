/**
 * Operator-entered supplier opening/payable amount.
 * Reject truncated parseFloat inputs before any accounting mutation.
 */
export function parseSupplierAmountInput(raw: string, mode: "opening" | "payment"): number {
  const value = raw.trim();
  if (mode === "opening" && !value) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || value.length > 22) {
    throw new Error("Supplier " + mode + " amount must be a plain non-negative two-decimal number.");
  }
  const [whole, fractional = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || (mode === "payment" && cents === 0n)) {
    throw new Error("Supplier " + mode + " amount is zero or outside supported limits.");
  }
  return Number(cents) / 100;
}
