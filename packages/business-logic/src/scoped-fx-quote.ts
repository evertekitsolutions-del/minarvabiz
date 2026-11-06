/**
 * PLT-014 — deterministic, read-only FX quote preflight.
 * Original Minarva Biz implementation; no third-party source copied.
 * Never use this preview as authority for ledger posting or settlement.
 */
export interface ScopedFxQuoteInput {
  tenantId: string;
  companyId: string;
  branchId: string;
  rateTenantId: string;
  rateCompanyId: string;
  rateBranchId: string;
  fromCurrency: string;
  toCurrency: string;
  rateFromCurrency: string;
  rateToCurrency: string;
  sourceMinor: number;
  numerator: string;
  denominator: string;
  rateRevision: number;
  expectedRateRevision: number;
  effectiveAt: string;
  expiresAt: string;
  quotedAt: string;
}

export interface ScopedFxQuote {
  sourceMinor: number;
  convertedMinor: number;
  roundingRemainderNumerator: string;
  roundingDenominator: string;
  rateRevision: number;
  fromCurrency: string;
  toCurrency: string;
}

const validId = (value: string): boolean =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  !/[\u0000-\u001f]/.test(value);
const validCurrency = (value: string): boolean => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const validTimestamp = (value: string): number => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error("Invalid UTC timestamp");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value.replace(/(\.\d{1,3})?Z$/, (_match, fraction: string | undefined) => `.${(fraction?.slice(1) ?? "").padEnd(3, "0")}Z`)) {
    throw new Error("Invalid UTC timestamp");
  }
  return ms;
};
const positiveInteger = (value: string): bigint => {
  if (typeof value !== "string" || !/^[1-9]\d{0,17}$/.test(value)) {
    throw new Error("Invalid positive FX ratio");
  }
  return BigInt(value);
};

/** Caller must authorize the rate snapshot and atomically reserve its revision before posting. */
export function previewScopedFxQuote(input: ScopedFxQuoteInput): ScopedFxQuote {
  if (!input || !validId(input.tenantId) || !validId(input.companyId) ||
      !validId(input.branchId) || !validId(input.rateTenantId) ||
      !validId(input.rateCompanyId) || !validId(input.rateBranchId) ||
      input.tenantId !== input.rateTenantId || input.companyId !== input.rateCompanyId ||
      input.branchId !== input.rateBranchId) {
    throw new Error("FX rate scope mismatch");
  }
  if (!validCurrency(input.fromCurrency) || !validCurrency(input.toCurrency) ||
      input.fromCurrency === input.toCurrency ||
      input.fromCurrency !== input.rateFromCurrency || input.toCurrency !== input.rateToCurrency) {
    throw new Error("FX currency pair mismatch");
  }
  if (!Number.isSafeInteger(input.sourceMinor) || input.sourceMinor < 0 ||
      !Number.isSafeInteger(input.rateRevision) || input.rateRevision < 1 ||
      input.rateRevision !== input.expectedRateRevision) {
    throw new Error("Invalid amount or stale FX revision");
  }
  const effective = validTimestamp(input.effectiveAt);
  const expiry = validTimestamp(input.expiresAt);
  const quoted = validTimestamp(input.quotedAt);
  if (!(effective <= quoted && quoted < expiry)) throw new Error("FX rate is not effective");
  const numerator = positiveInteger(input.numerator);
  const denominator = positiveInteger(input.denominator);
  const product = BigInt(input.sourceMinor) * numerator;
  const rounded = (product * 2n + denominator) / (2n * denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FX conversion overflow");
  return {
    sourceMinor: input.sourceMinor,
    convertedMinor: Number(rounded),
    roundingRemainderNumerator: (product % denominator).toString(),
    roundingDenominator: denominator.toString(),
    rateRevision: input.rateRevision,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
  };
}
