/**
 * Shared, industry-neutral document numbering for Online, Offline and Hybrid.
 * Existing default retains the Indian Apr–Mar fiscal calendar.
 *
 * These pure helpers only propose the next display number. Callers must reserve
 * the sequence transactionally in their tenant/company/branch-scoped writer;
 * a preview is NOT a unique identifier or an atomic reservation.
 */
export type BusinessDocumentKind = "INV" | "QT";

/** Month is 1 (January) through 12 (December), independent of locale. */
export function financialYearLabel(date = new Date(), fiscalYearStartMonth = 4): string {
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error("Fiscal year start month must be an integer from 1 to 12.");
  }
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("Invalid document date.");
  }
  const year = date.getFullYear();
  const start = date.getMonth() + 1 >= fiscalYearStartMonth ? year : year - 1;
  // Calendar-year businesses should not receive a misleading 2026-27 label.
  if (fiscalYearStartMonth === 1) return String(year);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function deriveBusinessDocumentCode(name: string): string {
  const words = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !["PRIVATE", "PVT", "LIMITED", "LTD", "LLP", "LLC", "INC", "COMPANY", "CO"].includes(word));
  if (!words.length) return "BIZ";
  if (words.length === 1) return words[0].slice(0, 8);
  const initials = words.map((word) => word[0]).join("").slice(0, 8);
  return initials || words.join("").slice(0, 8) || "BIZ";
}

export function normalizeBusinessDocumentCode(value: string, fallbackName = ""): string {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return normalized || deriveBusinessDocumentCode(fallbackName);
}

export function nextBusinessDocumentNumber(input: {
  kind: BusinessDocumentKind;
  existingNumbers: Array<string | null | undefined>;
  businessCode?: string;
  businessName?: string;
  date?: Date;
  /** Optional calendar configuration; defaults to April for legacy records. */
  fiscalYearStartMonth?: number;
}): string {
  if (input.kind !== "INV" && input.kind !== "QT") throw new Error("Unsupported document kind.");
  const date = input.date ?? new Date();
  const code = normalizeBusinessDocumentCode(input.businessCode || "", input.businessName || "");
  const prefix = `${input.kind}-${code}-${financialYearLabel(date, input.fiscalYearStartMonth ?? 4)}-`;
  let max = 0;
  for (const value of input.existingNumbers) {
    if (!value?.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    // Do not interpret a malformed historical value as a valid sequence.
    if (!/^\d{5,}$/.test(suffix)) continue;
    const parsed = Number(suffix);
    if (Number.isSafeInteger(parsed) && parsed > max) max = parsed;
  }
  if (max >= Number.MAX_SAFE_INTEGER) throw new Error("Document sequence exhausted.");
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}
