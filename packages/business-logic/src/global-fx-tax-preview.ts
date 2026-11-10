/**
 * P1 FX/tax preview primitives (feature gated by the caller; NO payment/ledger writes).
 * Monetary arithmetic is exact in minor units. OMR uses 3 decimals.
 * All rates are immutable externally sourced snapshots, not live lookups.
 */
export const GLOBAL_CURRENCY_MINOR_DIGITS = Object.freeze({
  INR: 2, USD: 2, EUR: 2, AED: 2, OMR: 3,
} as const);

export type GlobalCurrency = keyof typeof GLOBAL_CURRENCY_MINOR_DIGITS;

export interface GlobalFxSnapshot {
  readonly base: GlobalCurrency;
  readonly quote: GlobalCurrency;
  /** Exact decimal: quote MAJOR units for one base MAJOR unit. */
  readonly quotePerBase: string;
  /** UTC point-in-time of rate sampling (ISO 8601). */
  readonly capturedAt: string;
  /** Traceable reference supplied by approved provider or manual operator. */
  readonly source: string;
}

const MAX_MINOR_DIGITS = 20;
function minorInteger(value: string): bigint {
  if (!/^-?(?:0|[1-9]\d*)$/.test(value) || value.replace("-", "").length > MAX_MINOR_DIGITS) {
    throw new RangeError("Amount must be an exact bounded integer of minor units");
  }
  return BigInt(value);
}
function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Invalid conversion denominator");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const whole = magnitude / denominator;
  const remainder = magnitude % denominator;
  return sign * (whole + (remainder * 2n >= denominator ? 1n : 0n));
}
function rateFraction(rate: string): [bigint, bigint] {
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,12})?$/.test(rate)) {
    throw new RangeError("FX rate must be a positive decimal of at most 12 places");
  }
  const [whole, fraction = ""] = rate.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new RangeError("FX rate cannot be zero");
  return [numerator, denominator];
}

/** Read-only preview; no FX rate refresh, no persisted invoice or ledger mutation. */
export function previewGlobalFxConversion(
  baseMinor: string,
  input: Readonly<GlobalFxSnapshot>,
): Readonly<{
  base: GlobalCurrency;
  quote: GlobalCurrency;
  baseMinor: string;
  quoteMinor: string;
  snapshot: Readonly<GlobalFxSnapshot>;
}> {
  if (!(input.base in GLOBAL_CURRENCY_MINOR_DIGITS) ||
      !(input.quote in GLOBAL_CURRENCY_MINOR_DIGITS) ||
      input.base === input.quote) throw new RangeError("Invalid FX currency pair");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.capturedAt) ||
      !Number.isFinite(Date.parse(input.capturedAt))) {
    throw new RangeError("FX snapshot requires a UTC timestamp");
  }
  if (!input.source?.trim() || input.source.length > 120) {
    throw new RangeError("FX snapshot must identify its source");
  }
  const minor = minorInteger(baseMinor);
  const [numerator, denominator] = rateFraction(input.quotePerBase);
  const quoteScale = 10n ** BigInt(GLOBAL_CURRENCY_MINOR_DIGITS[input.quote]);
  const baseScale = 10n ** BigInt(GLOBAL_CURRENCY_MINOR_DIGITS[input.base]);
  const converted = roundHalfAway(minor * numerator * quoteScale, denominator * baseScale);
  const snapshot = Object.freeze({ ...input });
  return Object.freeze({
    base: input.base, quote: input.quote,
    baseMinor: minor.toString(), quoteMinor: converted.toString(), snapshot,
  });
}

/**
 * Country-neutral tax math. Caller must supply a verified jurisdiction rule,
 * effective period, and applicable rate; this helper deliberately chooses none.
 */
export function previewGlobalTax(
  amountMinor: string,
  rateBasisPoints: number,
  inclusive: boolean,
): Readonly<{ netMinor: string; taxMinor: string; grossMinor: string }> {
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 ||
      rateBasisPoints > 10000) throw new RangeError("Invalid tax basis points");
  if (typeof inclusive !== "boolean") throw new TypeError("Tax inclusion must be explicit");
  const amount = minorInteger(amountMinor);
  const rate = BigInt(rateBasisPoints);
  const net = inclusive ? roundHalfAway(amount * 10000n, 10000n + rate) : amount;
  const gross = inclusive ? amount : amount + roundHalfAway(net * rate, 10000n);
  return Object.freeze({
    netMinor: net.toString(),
    taxMinor: (gross - net).toString(),
    grossMinor: gross.toString(),
  });
}
