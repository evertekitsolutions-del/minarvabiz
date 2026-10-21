/**
 * Global Core — reuse of MIT Open Mercato locale-aware numeric input, but
 * domain authority remains in Minarva's existing strict, canonical validators.
 *
 * This adapter is for human-typed NONFINANCIAL quantities only. No currency
 * posting, stock quantity write, purchase order or invoice is authorised here.
 */
import { parseLocaleNumber } from "./vendor/open-mercato/number";
import { canonicalizeUnitCode } from "./vendor/open-mercato/unitCodes";

const LOCALES = ["en-IN","en-US","de-DE","fr-FR"] as const;
export type SupportedInputLocale = (typeof LOCALES)[number];

/**
 * Normalize international RFQ quantities to a domain-safe canonical decimal.
 * Open Mercato parses the separator convention; Minarva enforces exact milli-
 * unit precision, positive safe range, and disallows exponent notation.
 *
 * A single comma or dot is ALWAYS a decimal mark (per upstream contract):
 * "1,234" means 1.234, NOT one thousand two hundred and thirty-four.
 * Input should show this convention clearly before a human submits.
 */
export function normalizeLocalizedRfqQuantity(raw: string, locale: SupportedInputLocale): string {
  if (typeof raw !== "string" || raw.length > 80 || !LOCALES.includes(locale) || /[eE]/.test(raw)) {
    throw new Error("RFQ quantity has an invalid locale or numeric format");
  }
  const trimmed = raw.trim();
  const separators = trimmed.match(/[.,]/g) ?? [];
  if (separators.length) {
    // When the same separator is repeated, upstream accepts grouping only.
    // Otherwise the final decimal fragment cannot exceed 3 digits.
    const last = Math.max(trimmed.lastIndexOf("."),trimmed.lastIndexOf(","));
    const suffix = trimmed.slice(last + 1);
    if (!/^\d{1,3}$/.test(suffix)) {
      throw new Error("RFQ quantities require at most three decimals");
    }
  }
  const parsed = parseLocaleNumber(trimmed, locale);
  if (parsed == null || parsed <= 0) throw new Error("RFQ quantity must be a positive number");
  const milli = Math.round(parsed * 1000);
  if (!Number.isSafeInteger(milli) || milli <= 0 || Math.abs(parsed * 1000 - milli) > 1e-7) {
    throw new Error("RFQ quantities require safe precision to three decimals");
  }
  return String(milli / 1000);
}

export { canonicalizeUnitCode };
