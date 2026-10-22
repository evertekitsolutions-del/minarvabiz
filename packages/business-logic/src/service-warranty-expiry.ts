/**
 * SVC-011 — Branch-scoped warranty expiry follow-up worksheet.
 * Caller must supply the result of permission-gated listServiceWarranties().
 * This module is read-only: no messaging, warranty extension, entitlement,
 * cloud write, payment or service-job mutation.
 */
import type { ServiceWarranty } from "./service-warranty-register";

export type WarrantyExpiryHorizon = 30 | 60 | 90;
export type WarrantyExpiryStatus = "expired" | "due_today" | "due_soon";
export interface WarrantyExpiryRow {
  readonly warrantyId: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly assetReference: string;
  readonly coverageEndsOn: string;
  readonly daysRemaining: number;
  readonly status: WarrantyExpiryStatus;
}
export interface WarrantyExpiryReport {
  readonly rows: readonly WarrantyExpiryRow[];
  readonly expiredCount: number;
  readonly dueSoonCount: number;
  readonly outsideHorizonCount: number;
  readonly horizonDays: WarrantyExpiryHorizon;
  readonly asOf: string;
}
const DAY_MS = 86_400_000;
function utcCivilDay(value: string): number {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new Error("Invalid warranty expiry calendar date");
  }
  const [year, month, day] = value.split("-").map(Number);
  const epoch = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid warranty expiry calendar date");
  }
  return epoch / DAY_MS;
}

/** Inclusive horizon, deterministic across browser locale and DST boundaries. */
export function buildServiceWarrantyExpiryReport(
  warranties: readonly ServiceWarranty[],
  asOf: string,
  horizonDays: WarrantyExpiryHorizon = 30,
): WarrantyExpiryReport {
  if (horizonDays !== 30 && horizonDays !== 60 && horizonDays !== 90) {
    throw new Error("Unsupported warranty expiry horizon");
  }
  const today = utcCivilDay(asOf);
  const ids = new Set<string>();
  const rows: WarrantyExpiryRow[] = [];
  let expiredCount = 0;
  let dueSoonCount = 0;
  for (const warranty of warranties) {
    if (ids.has(warranty.id)) throw new Error("Duplicate warranty in expiry report");
    ids.add(warranty.id);
    const daysRemaining = utcCivilDay(warranty.endsOn) - today;
    if (daysRemaining < 0) expiredCount++;
    else if (daysRemaining <= horizonDays) dueSoonCount++;
    else continue;
    rows.push({
      warrantyId: warranty.id,
      branchId: warranty.branchId,
      orderId: warranty.orderId,
      customerId: warranty.customerId,
      assetReference: warranty.assetReference,
      coverageEndsOn: warranty.endsOn,
      daysRemaining,
      status: daysRemaining < 0 ? "expired" : daysRemaining === 0 ? "due_today" : "due_soon",
    });
  }
  rows.sort((a, b) => a.daysRemaining - b.daysRemaining ||
    a.orderId.localeCompare(b.orderId) || a.warrantyId.localeCompare(b.warrantyId));
  return { rows, expiredCount, dueSoonCount,
    outsideHorizonCount: warranties.length - expiredCount - dueSoonCount, horizonDays, asOf };
}
function csvCell(raw: string): string {
  const normalized = raw.replace(/[\r\n\t]/g, " ");
  // Spreadsheet formula injection can start after whitespace; quoting alone is insufficient.
  const safe = /^\s*[=+\-@]/.test(normalized) ? "'" + normalized : normalized;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Only includes branch-authorized report rows; never includes customer phone/email. */
export function exportServiceWarrantyExpiryCsv(rows: readonly WarrantyExpiryRow[]): string {
  const fields = ["Warranty ID", "Branch ID", "Service order ID", "Customer ID",
    "Asset reference", "Coverage ends", "Days remaining", "Follow-up status"];
  const data = rows.map(row => [
    row.warrantyId, row.branchId, row.orderId, row.customerId,
    row.assetReference, row.coverageEndsOn, String(row.daysRemaining), row.status,
  ]);
  return [fields, ...data].map(values => values.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
