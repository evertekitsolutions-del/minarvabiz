/**
 * FIN-018 (planning slice) — straight-line fixed asset depreciation calendar.
 *
 * Original portable logic inspired by conventional ERP asset schedules.
 * No depreciation expense is posted, no asset/ledger record is created, and
 * no upstream ERPNext, Odoo or Dolibarr GPL/LGPL source code is incorporated.
 */
export interface AssetDepreciationInput {
  readonly assetReference: string;
  readonly assetName: string;
  /** ISO local-business calendar date. First full charge at month end. */
  readonly depreciationStartDate: string;
  readonly acquisitionCost: string;
  readonly residualValue: string;
  readonly usefulLifeMonths: number;
}
export interface AssetDepreciationPeriod {
  readonly month: number;
  readonly postingDate: string;
  readonly openingBookValue: number;
  readonly expense: number;
  readonly accumulatedDepreciation: number;
  readonly closingBookValue: number;
}
export interface AssetDepreciationSchedule {
  readonly assetReference: string;
  readonly assetName: string;
  readonly cost: number;
  readonly residual: number;
  readonly totalDepreciation: number;
  readonly usefulLifeMonths: number;
  readonly periods: readonly AssetDepreciationPeriod[];
  readonly csv: string;
}
function amountCents(value: string, label: string): number {
  // No currency symbols, locale separators, exponents, signs, blank or
  // precision loss: all accounting allocation is done in integer cents.
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(label + " must have at most 2 decimals and no separators");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(label + " exceeds safe monetary range");
  return cents;
}
function startMonth(value: string): { year: number; month: number } {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error("Depreciation start date must be YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error("Invalid depreciation start date");
  }
  return {year, month};
}
function monthEnd(year: number, month: number, increment: number): string {
  // The date represents a business calendar day and is timezone-independent.
  const date = new Date(Date.UTC(year, month + increment, 0));
  return date.toISOString().slice(0,10);
}
function cell(value: string | number): string {
  const raw = String(value);
  const safe = /^[\s\uFEFF]*[=+\-@\t\r]/u.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Bookkeeping preview only, not statutory/tax depreciation advice or a posted journal. */
export function buildAssetDepreciationSchedule(input: AssetDepreciationInput): AssetDepreciationSchedule {
  const assetReference = input.assetReference.trim();
  const assetName = input.assetName.trim();
  if (!assetReference || !assetName || assetReference.length > 128 || assetName.length > 256) {
    throw new Error("Fixed asset reference and name are required and length-limited");
  }
  const start = startMonth(input.depreciationStartDate);
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1 || input.usefulLifeMonths > 360) {
    throw new Error("Useful life must be between 1 and 360 whole months");
  }
  const costCents = amountCents(input.acquisitionCost, "Acquisition cost");
  const residualCents = amountCents(input.residualValue, "Residual value");
  if (costCents <= 0 || residualCents >= costCents) {
    throw new Error("Acquisition cost must exceed residual value");
  }
  const totalCents = costCents - residualCents;
  const baseCharge = Math.floor(totalCents / input.usefulLifeMonths);
  const extraPennyPeriods = totalCents % input.usefulLifeMonths;
  const periods: AssetDepreciationPeriod[] = [];
  let bookCents = costCents, accumulatedCents = 0;
  for (let i=0; i<input.usefulLifeMonths; i++) {
    const chargeCents = baseCharge + (i < extraPennyPeriods ? 1 : 0);
    const openingCents = bookCents;
    accumulatedCents += chargeCents;
    bookCents -= chargeCents;
    periods.push({
      month: i + 1,
      postingDate: monthEnd(start.year, start.month, i),
      openingBookValue: openingCents / 100,
      expense: chargeCents / 100,
      accumulatedDepreciation: accumulatedCents / 100,
      closingBookValue: bookCents / 100,
    });
  }
  if (bookCents !== residualCents || accumulatedCents !== totalCents) {
    throw new Error("Fixed asset depreciation does not reconcile");
  }
  const csv = [
    ["Asset reference", "Asset name", "Period", "Month end", "Opening book value",
      "Depreciation charge", "Accumulated depreciation", "Closing book value"],
    ...periods.map(period => [
      assetReference, assetName, String(period.month), period.postingDate,
      period.openingBookValue.toFixed(2), period.expense.toFixed(2),
      period.accumulatedDepreciation.toFixed(2), period.closingBookValue.toFixed(2),
    ]),
  ].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
  return {
    assetReference, assetName, cost: costCents / 100, residual: residualCents / 100,
    totalDepreciation: totalCents / 100, usefulLifeMonths: input.usefulLifeMonths, periods, csv,
  };
}
