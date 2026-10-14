/** Default tax rates must be finite, non-negative percentages. */
export function isValidDefaultTaxRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Form inputs must not silently coerce blank or malformed text into a rate. */
export function parseDefaultTaxRateInput(raw: string): number {
  const text = raw.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    throw new Error("Enter a valid tax rate between 0% and 100%.");
  }
  const value = Number(text);
  if (!isValidDefaultTaxRate(value)) {
    throw new Error("Tax rate must be between 0% and 100%.");
  }
  return value;
}
