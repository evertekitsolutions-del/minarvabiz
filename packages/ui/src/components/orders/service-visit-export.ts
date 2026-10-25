/** SVC-005: operator-initiated export of branch-authorized site visits. No cloud writes. */
export interface ServiceVisitExportRow {
  orderNumber: string;
  technician: string;
  plannedDate: string;
  siteAddress: string;
  status: "scheduled" | "arrived" | "completed" | "cancelled";
  arrivedAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
}

const REPORT_HEADER = [
  "service_order", "technician", "planned_date", "site_address",
  "visit_status", "arrived_at_utc", "completed_at_utc", "cancellation_reason",
] as const;

/**
 * CSV text fields must never evaluate as spreadsheet formulas, even with
 * leading whitespace / tabs / Unicode bidi or an existing leading apostrophe.
 */
function csvSafe(value: string): string {
  if (value.length > 3000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new Error("Visit report contains an invalid field.");
  }
  const prefixed = /^[\s\uFEFF\u200B-\u200F\u202A-\u202E\u2066-\u2069]*[=+\-@]/u.test(value) ||
    value.startsWith("'") || /^[\t\r\n]/u.test(value)
    ? "'" + value : value;
  return /[",\r\n]/u.test(prefixed) ? '"' + prefixed.replace(/"/gu, '""') + '"' : prefixed;
}

function optionalUtc(value: string | null): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 32 ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error("Visit report timestamp must be valid UTC ISO.");
  }
  return value;
}

export function buildBranchServiceVisitReportCsv(visits: readonly ServiceVisitExportRow[]): string {
  if (visits.length > 20_000) throw new Error("Field visit export is limited to 20,000 rows.");
  const rows = [REPORT_HEADER.join(",")];
  for (const visit of visits) {
    if (!["scheduled", "arrived", "completed", "cancelled"].includes(visit.status)) {
      throw new Error("Invalid field visit state.");
    }
    if (!/^\d{4}-\d\d-\d\d$/u.test(visit.plannedDate) ||
        !Number.isFinite(Date.parse(visit.plannedDate + "T00:00:00Z")) ||
        new Date(visit.plannedDate + "T00:00:00Z").toISOString().slice(0, 10) !== visit.plannedDate) {
      throw new Error("Invalid visit date.");
    }
    const arrivedAt = optionalUtc(visit.arrivedAt);
    const completedAt = optionalUtc(visit.completedAt);
    if (visit.status === "arrived" && !arrivedAt ||
        visit.status === "completed" && (!arrivedAt || !completedAt)) {
      throw new Error("Visit lifecycle timestamps are inconsistent.");
    }
    rows.push([
      csvSafe(visit.orderNumber), csvSafe(visit.technician), visit.plannedDate,
      csvSafe(visit.siteAddress), visit.status,
      arrivedAt, completedAt, csvSafe(visit.cancellationReason ?? ""),
    ].join(","));
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}
