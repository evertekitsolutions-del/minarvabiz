/** Read-only active-branch laundry ticket receivables by promised due date.
 * Not an accounts receivable general ledger or historical as-of reconstruction.
 */
import type { LaundryOrder } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { activeLaundryBranchId, laundryRecordInActiveBranch } from "./laundry-branch-scope";
import { csvCell } from "./laundry-tickets-csv";

export type LaundryAgeBucket = "not_due" | "days_1_7" | "days_8_30" | "days_31_60" | "days_61_plus" | "undated";
export interface LaundryAgeRow {
  id: string;
  ticket: string;
  customerId: string;
  customerName: string;
  mode: LaundryOrder["mode"];
  status: LaundryOrder["status"];
  dueDate: string | null;
  daysOverdue: number | null;
  balance: number;
  bucket: LaundryAgeBucket;
}
export interface LaundryAgeReport {
  asOfDay: string;
  branchId: string;
  tickets: number;
  outstanding: number;
  buckets: Record<LaundryAgeBucket, number>;
  rows: LaundryAgeRow[];
}
const BUCKETS: LaundryAgeBucket[] = ["not_due","days_1_7","days_8_30","days_31_60","days_61_plus","undated"];
function utcDay(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid laundry ageing date");
  const time = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid laundry ageing date");
  }
  return time;
}
export function buildLaundryReceivablesAgeing(
  orders: readonly LaundryOrder[], asOfDay: string,
): LaundryAgeReport {
  assertPermission("reports.view");
  const day = utcDay(asOfDay);
  const branchId = activeLaundryBranchId();
  if (!branchId) throw new Error("Active branch required for laundry ageing");
  if (!Array.isArray(orders) || orders.length > 100000) throw new Error("Invalid laundry ageing input");
  const seen = new Set<string>();
  const amounts: Record<LaundryAgeBucket, number> = {
    not_due:0, days_1_7:0, days_8_30:0, days_31_60:0, days_61_plus:0, undated:0,
  };
  const rows: LaundryAgeRow[] = [];
  let totalMinor = 0;
  for (const order of orders) {
    if (!order || typeof order.id !== "string" || !order.id || order.deletedAt
      || order.status === "cancelled" || !laundryRecordInActiveBranch(order) || seen.has(order.id)) continue;
    seen.add(order.id);
    const balanceMinor = toMinorUnits(order.balanceAmount);
    if (balanceMinor < 0) throw new Error("Invalid negative laundry receivable");
    if (balanceMinor === 0) continue;
    const dueDate = order.dueAt?.slice(0, 10) || null;
    const daysOverdue = dueDate ? Math.floor((day - utcDay(dueDate)) / 86400000) : null;
    const bucket: LaundryAgeBucket = daysOverdue === null ? "undated"
      : daysOverdue <= 0 ? "not_due"
      : daysOverdue <= 7 ? "days_1_7"
      : daysOverdue <= 30 ? "days_8_30"
      : daysOverdue <= 60 ? "days_31_60" : "days_61_plus";
    totalMinor = addMinorUnits(totalMinor, balanceMinor);
    amounts[bucket] = addMinorUnits(amounts[bucket], balanceMinor);
    rows.push({
      id:order.id, ticket:order.orderNumber, customerId:order.customerId,
      customerName:order.customerName || order.customerId, mode:order.mode, status:order.status,
      dueDate, daysOverdue, balance:fromMinorUnits(balanceMinor), bucket,
    });
  }
  rows.sort((a,b) => (b.daysOverdue??-1) - (a.daysOverdue??-1)
    || a.customerName.localeCompare(b.customerName) || a.ticket.localeCompare(b.ticket) || a.id.localeCompare(b.id));
  const buckets = Object.fromEntries(BUCKETS.map(bucket => [bucket,fromMinorUnits(amounts[bucket])])) as LaundryAgeReport["buckets"];
  return { asOfDay, branchId, tickets:rows.length, outstanding:fromMinorUnits(totalMinor), buckets, rows };
}

/** Exports exactly the branch-scoped preflighted report, without claiming ledger reconciliation. */
export function exportLaundryReceivablesAgeingCsv(report: LaundryAgeReport): string {
  assertPermission("reports.view");
  if (!report || !report.branchId || report.branchId !== activeLaundryBranchId()) {
    throw new Error("Active branch changed; regenerate laundry ageing report");
  }
  utcDay(report.asOfDay);
  const headers = ["ticket","customer_id","customer","mode","status","due_date","days_overdue","age_bucket","balance"];
  const lines = report.rows.map(row=>[
    row.ticket,row.customerId,row.customerName,row.mode,row.status,row.dueDate||"",
    row.daysOverdue??"",row.bucket,row.balance,
  ].map(csvCell).join(","));
  return ["# Current ticket balances by due date; not a reconciled customer ledger",
    "# Active branch only; cancelled and zero-balance tickets excluded",
    headers.join(","),...lines].join("\r\n")+"\r\n";
}
