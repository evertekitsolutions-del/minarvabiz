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

function roundIntegerDivision(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Invalid integer division");
  }
  if (numerator >= 0) return safeInteger(Math.floor((numerator + Math.floor(denominator / 2)) / denominator), "Rounded value");
  return -safeInteger(Math.floor((-numerator + Math.floor(denominator / 2)) / denominator), "Rounded value");
}

export function toMinorUnits(amount: number): MoneyMinor {
  if (!Number.isFinite(amount)) throw new Error("Money amount must be finite");
  return safeInteger(Math.round(amount * MONEY_MINOR_FACTOR), "Money amount");
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
  if (!Number.isFinite(quantity)) throw new Error("Quantity must be finite");
  return safeInteger(Math.round(quantity * QUANTITY_MILLI_FACTOR), "Quantity");
}

export function toPercentBasisPoints(percent: number): PercentBasisPoints {
  if (!Number.isFinite(percent)) throw new Error("Percent must be finite");
  return safeInteger(Math.round(percent * PERCENT_BASIS_FACTOR), "Percent");
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
  safeInteger(amountMinor, "Money minor amount");
  const quantityMilli = toQuantityMilli(quantity);
  const numerator = safeInteger(amountMinor * quantityMilli, "Money quantity product");
  return safeInteger(roundIntegerDivision(numerator, QUANTITY_MILLI_FACTOR), "Money quantity result");
}

export function percentOfMinor(amountMinor: MoneyMinor, percent: number): MoneyMinor {
  safeInteger(amountMinor, "Money minor amount");
  const basisPoints = toPercentBasisPoints(percent);
  const numerator = safeInteger(amountMinor * basisPoints, "Money percent product");
  return safeInteger(roundIntegerDivision(numerator, 100 * PERCENT_BASIS_FACTOR), "Money percent result");
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
