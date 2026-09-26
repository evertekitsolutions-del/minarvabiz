/**
 * Financial-year document numbering shared by Online / Offline / Hybrid.
 *
 * Format is deliberately compact so GST invoice numbers remain <= 16 chars:
 * INV-MB-2627-0001
 * QT-MB-2627-0001
 */
export type BusinessDocumentKind = "invoice" | "quotation";

function cleanCode(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
}

export function deriveBusinessDocumentCode(explicitCode: string | null | undefined, businessName: string | null | undefined): string {
  const explicit = cleanCode(explicitCode || "");
  if (explicit.length === 2) return explicit;
  const words = String(businessName || "").trim().split(/\s+/).filter(Boolean);
  const initials = cleanCode(words.map((word) => word[0] || "").join(""));
  if (initials.length === 2) return initials;
  const compact = cleanCode(words.join(""));
  if (compact.length === 2) return compact;
  return "MB";
}

export function financialYearKey(date = new Date(), startMonth = 4): string {
  const safeStartMonth = Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12 ? startMonth : 4;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= safeStartMonth ? year : year - 1;
  const a = String(startYear % 100).padStart(2, "0");
  const b = String((startYear + 1) % 100).padStart(2, "0");
  return `${a}${b}`;
}

export function nextBusinessDocumentNumber(
  kind: BusinessDocumentKind,
  existingNumbers: string[],
  options?: {
    businessCode?: string | null;
    businessName?: string | null;
    financialYearStartMonth?: number;
    date?: Date;
  },
): string {
  const prefix = kind === "quotation" ? "QT" : "INV";
  const code = deriveBusinessDocumentCode(options?.businessCode, options?.businessName);
  const fy = financialYearKey(options?.date ?? new Date(), options?.financialYearStartMonth ?? 4);
  const stem = `${prefix}-${code}-${fy}-`;
  let max = 0;
  for (const value of existingNumbers) {
    if (!value.startsWith(stem)) continue;
    const seq = Number.parseInt(value.slice(stem.length), 10);
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  const next = max + 1;
  if (next > 9999) throw new Error(`${prefix} sequence limit reached for financial year ${fy}`);
  return `${stem}${String(next).padStart(4, "0")}`;
}
