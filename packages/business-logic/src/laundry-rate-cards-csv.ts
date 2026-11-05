/** Bulk laundry tariffs from a strict local CSV; rates only, no supplier payments or price history. */
import { activeLaundryBranchId } from "./laundry-branch-scope";
import {
  listLaundryRateCards, saveLaundryRateCardsBatch, validateLaundryRateCards,
  type LaundryRateCard, type LaundryRateInput,
  type LaundryFabricCode, type LaundryProcessingMode, type LaundryServiceCode,
} from "./laundry-rate-cards";
import { parseCsvRecord, readCsvRecords } from "./strict-csv";
import { csvCell } from "./laundry-tickets-csv";

const HEADER = [
  "mode", "service", "garment", "fabric", "supplier_id",
  "customer_rate", "supplier_rate", "tat_hours",
] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
export interface LaundryRateCsvPreview {
  rows: LaundryRateInput[];
  errors: string[];
}
export function currentLaundryRateCatalogBranchId(): string | null {
  return activeLaundryBranchId();
}

export function exportLaundryRateCardCsv(rows: readonly LaundryRateCard[] = listLaundryRateCards()): string {
  const lines = rows.map(row => [
    row.mode, row.serviceCode, row.garment, row.fabric, row.supplierId || "",
    row.customerRate, row.supplierRate, row.tatHours,
  ].map(csvCell).join(","));
  return HEADER.join(",") + "\r\n" + lines.join("\r\n") + (lines.length ? "\r\n" : "");
}

/** Pure preview. Import never starts until the user explicitly confirms. */
export function previewLaundryRateCardCsv(source: string): LaundryRateCsvPreview {
  if (typeof source !== "string" || source.length > MAX_BYTES) {
    return { rows: [], errors: ["Laundry rate CSV exceeds the 2 MB limit"] };
  }
  let records: ReturnType<typeof readCsvRecords>;
  try { records = readCsvRecords(source.replace(/^\uFEFF/, "")); }
  catch (error) { return { rows: [], errors: [error instanceof Error ? error.message : String(error)] }; }
  if (records.length < 2) return { rows: [], errors: ["CSV requires a header and at least one rate row"] };
  if (records.length > MAX_ROWS + 1) return { rows: [], errors: ["CSV exceeds 1000 rate rows"] };
  let headings: string[];
  try { headings = parseCsvRecord(records[0].text).map(v => v.trim().toLowerCase()); }
  catch (error) { return { rows: [], errors: ["Header: " + (error instanceof Error ? error.message : String(error))] }; }
  if (headings.length !== HEADER.length || new Set(headings).size !== HEADER.length ||
      !HEADER.every(column => headings.includes(column))) {
    return { rows: [], errors: ["CSV columns must be mode,service,garment,fabric,supplier_id,customer_rate,supplier_rate,tat_hours"] };
  }
  const idx = (name: string) => headings.indexOf(name);
  const errors: string[] = [];
  const rows: LaundryRateInput[] = [];
  const amount = (value: string, field: string, line: number): number => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
      errors.push("Row " + line + ": " + field + " must be a non-negative amount with at most 2 decimals");
      return 0;
    }
    return Number(value);
  };
  for (const record of records.slice(1)) {
    let values: string[];
    try { values = parseCsvRecord(record.text); }
    catch (error) {
      errors.push("Row " + record.line + ": " + (error instanceof Error ? error.message : String(error)));
      continue;
    }
    if (values.length !== headings.length) {
      errors.push("Row " + record.line + ": wrong number of fields");
      continue;
    }
    const get = (field: string) => values[idx(field)];
    const tat = get("tat_hours");
    if (!/^[1-9]\d*$/.test(tat)) errors.push("Row " + record.line + ": invalid tat_hours");
    rows.push({
      mode: get("mode") as LaundryProcessingMode,
      serviceCode: get("service") as LaundryServiceCode,
      garment: get("garment"),
      fabric: get("fabric") as LaundryFabricCode,
      supplierId: get("supplier_id") || null,
      customerRate: amount(get("customer_rate"), "customer_rate", record.line),
      supplierRate: amount(get("supplier_rate"), "supplier_rate", record.line),
      tatHours: Number(tat),
    });
  }
  if (!errors.length) {
    try {
      validateLaundryRateCards(rows.map((row, i) => ({
        ...row, branchId: activeLaundryBranchId(), id: "csv-" + i, updatedAt: "2026-01-01T00:00:00.000Z",
      })));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}

/** Revalidates the same text and branch at commit time, denying stale previews. */
export function importLaundryRateCardCsv(
  source: string, expectedBranchId: string,
): { created: number; updated: number; errors: string[] } {
  const preview = previewLaundryRateCardCsv(source);
  if (preview.errors.length) return { created: 0, updated: 0, errors: preview.errors };
  try {
    const result = saveLaundryRateCardsBatch(preview.rows, expectedBranchId);
    return { ...result, errors: [] };
  } catch (error) {
    return { created: 0, updated: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
