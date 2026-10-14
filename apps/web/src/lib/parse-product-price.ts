/** Validate raw price input before schema validation; never coerce malformed text to zero. */
export function parseProductPrice(raw: string, field: string): number {
  const text = raw.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    throw new Error(`${field} must be a valid non-negative amount`);
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error(`${field} is outside the supported monetary range`);
  }
  return amount;
}
