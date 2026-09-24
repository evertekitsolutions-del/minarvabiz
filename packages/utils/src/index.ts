export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatMoney(amount: number, currency = "INR", locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export const MONEY_MINOR_FACTOR = 100;
export const QUANTITY_MILLI_FACTOR = 1000;
export const PERCENT_BASIS_FACTOR = 100;

export type MoneyMinor = number;
export type QuantityMilli = number;
export type PercentBasisPoints = number;

function safeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} exceeds the safe integer range`);
  return Object.is(value, -0) ? 0 : value;
}

function bigintToSafeInteger(value: bigint, label: string): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max || value < -max) throw new Error(`${label} exceeds the safe integer range`);
  return Number(value);
}

function decimalToScaledInteger(value: number, scaleDigits: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  if (!Number.isInteger(scaleDigits) || scaleDigits < 0 || scaleDigits > 9) {
    throw new Error("Invalid decimal scale");
  }

  const negative = value < 0;
  const raw = Math.abs(value).toString().toLowerCase();
  const [coefficient, exponentText] = raw.split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  if (!Number.isInteger(exponent)) throw new Error(`${label} has an invalid exponent`);

  const [whole = "0", fraction = ""] = coefficient.split(".");
  const digits = (whole + fraction).replace(/^0+(?=\d)/, "") || "0";
  let integer = BigInt(digits);
  const power = exponent - fraction.length + scaleDigits;

  if (power >= 0) {
    integer *= 10n ** BigInt(power);
  } else {
    const divisor = 10n ** BigInt(-power);
    const quotient = integer / divisor;
    const remainder = integer % divisor;
    integer = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }

  if (negative) integer = -integer;
  return bigintToSafeInteger(integer, label);
}

function multiplyDivideRounded(a: number, b: number, denominator: number, label: string): number {
  safeInteger(a, label);
  safeInteger(b, label);
  safeInteger(denominator, "Integer denominator");
  if (denominator <= 0) throw new Error("Integer denominator must be positive");

  const product = BigInt(a) * BigInt(b);
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const divisor = BigInt(denominator);
  let quotient = absolute / divisor;
  const remainder = absolute % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  return bigintToSafeInteger(negative ? -quotient : quotient, label);
}

export function toMinorUnits(amount: number): MoneyMinor {
  return decimalToScaledInteger(amount, 2, "Money amount");
}

export function fromMinorUnits(amountMinor: MoneyMinor): number {
  safeInteger(amountMinor, "Money minor amount");
  return amountMinor / MONEY_MINOR_FACTOR;
}

export function formatMinorUnits(amountMinor: MoneyMinor): string {
  safeInteger(amountMinor, "Money minor amount");
  const negative = amountMinor < 0;
  const absolute = Math.abs(amountMinor);
  const whole = Math.floor(absolute / MONEY_MINOR_FACTOR);
  const fraction = absolute % MONEY_MINOR_FACTOR;
  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}

export function toQuantityMilli(quantity: number): QuantityMilli {
  return decimalToScaledInteger(quantity, 3, "Quantity");
}

export function toPercentBasisPoints(percent: number): PercentBasisPoints {
  return decimalToScaledInteger(percent, 2, "Percent");
}

export function addMinorUnits(...amounts: MoneyMinor[]): MoneyMinor {
  let total = 0;
  for (const amount of amounts) {
    safeInteger(amount, "Money minor amount");
    total = safeInteger(total + amount, "Money total");
  }
  return total;
}

export function subtractMinorUnits(a: MoneyMinor, b: MoneyMinor): MoneyMinor {
  safeInteger(a, "Money minor amount");
  safeInteger(b, "Money minor amount");
  return safeInteger(a - b, "Money difference");
}

export function multiplyMinorByQuantity(amountMinor: MoneyMinor, quantity: number): MoneyMinor {
  const quantityMilli = toQuantityMilli(quantity);
  return multiplyDivideRounded(amountMinor, quantityMilli, QUANTITY_MILLI_FACTOR, "Money quantity result");
}

export function percentOfMinor(amountMinor: MoneyMinor, percent: number): MoneyMinor {
  const basisPoints = toPercentBasisPoints(percent);
  return multiplyDivideRounded(amountMinor, basisPoints, 100 * PERCENT_BASIS_FACTOR, "Money percent result");
}

export function roundMoney(amount: number): number {
  return fromMinorUnits(toMinorUnits(amount));
}

export function addMoney(...amounts: number[]): number {
  return fromMinorUnits(addMinorUnits(...amounts.map(toMinorUnits)));
}

export function subtractMoney(a: number, b: number): number {
  return fromMinorUnits(subtractMinorUnits(toMinorUnits(a), toMinorUnits(b)));
}

export function percentOf(amount: number, percent: number): number {
  return fromMinorUnits(percentOfMinor(toMinorUnits(amount), percent));
}

export function nowISO(): string { return new Date().toISOString(); }

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export function daysUntil(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple hash for non-crypto environments (not cryptographic)
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  return ("00000000" + (h >>> 0).toString(16)).slice(-8).padStart(64, "0");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
