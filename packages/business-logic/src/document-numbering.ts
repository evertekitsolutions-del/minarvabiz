/**
 * Business document numbering shared by Online, Offline and Hybrid editions.
 * Default format: INV-MT-2026-27-00001 / QT-MT-2026-27-00001.
 * Financial year follows the Indian Apr-Mar convention.
 */

export type BusinessDocumentKind = "INV" | "QT";

export function financialYearLabel(date = new Date()): string {
  const year = date.getFullYear();
  const start = date.getMonth() >= 3 ? year : year - 1;
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
}): string {
  const date = input.date ?? new Date();
  const code = normalizeBusinessDocumentCode(input.businessCode || "", input.businessName || "");
  const prefix = `${input.kind}-${code}-${financialYearLabel(date)}-`;
  let max = 0;
  for (const value of input.existingNumbers) {
    if (!value?.startsWith(prefix)) continue;
    const parsed = Number.parseInt(value.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}
