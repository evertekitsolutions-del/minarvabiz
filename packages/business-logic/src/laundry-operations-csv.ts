/** Spreadsheet-safe export of the existing booking-month laundry operations report. */
import type { LaundryOperationsReport } from "./laundry-operations-report";
import { csvCell } from "./laundry-tickets-csv";

export function exportLaundryOperationsCsv(report: LaundryOperationsReport): string {
  if (!report || !/^\d{4}-\d{2}-\d{2}$/.test(report.from)
    || !/^\d{4}-\d{2}-\d{2}$/.test(report.through)
    || !/^\d{4}-\d{2}-\d{2}$/.test(report.asOfDay)
    || report.from > report.through) throw new Error("Invalid laundry report period");
  const rows: Array<Array<string | number>> = [["section", "metric", "count", "amount", "tickets"]];
  const add = (section: string, metric: string, count: string | number = "", amount: string | number = "", tickets: string | number = "") =>
    rows.push([section, metric, count, amount, tickets]);
  add("period", "booked_from", report.from);
  add("period", "booked_through", report.through);
  add("period", "status_as_of", report.asOfDay);
  add("scope", "Booking-date cohort; current statuses; excludes cancelled tickets. Not the reconciled finance ledger.");
  add("ticket", "booked", report.bookedTickets);
  add("ticket", "active", report.activeTickets);
  add("ticket", "delivered", report.deliveredTickets);
  add("ticket", "overdue_open", report.overdueOpenTickets);
  add("ticket", "outsourced", report.outsourcedTickets);
  add("ticket", "in_house", report.inHouseTickets);
  add("garment", "pieces", report.garmentPieces);
  add("garment", "pieces_delivered", report.deliveredGarmentPieces);
  add("garment", "pieces_failed_qc", report.failedQcGarmentPieces);
  add("booking_financial", "booked_customer_charge", "", report.bookedCustomerCharge);
  add("booking_financial", "supplier_commitment", "", report.supplierCommitment);
  add("booking_financial", "contribution_before_overhead", "", report.contributionBeforeOverhead);
  for (const [stage, count] of Object.entries(report.stages).sort(([a], [b]) => a.localeCompare(b))) {
    add("processing_stage", stage, count);
  }
  for (const service of report.serviceVolumes) {
    add("service_volume", service.service, service.garmentCount, "", service.tickets);
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
