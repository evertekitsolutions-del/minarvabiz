/**
 * SAL-007 — deterministic recurring invoice DRAFT scheduler.
 *
 * Produces reviewable occurrences only. Never posts a sale, invoice, stock,
 * tax, ledger, payment, notification or outbox event. A separately authorised
 * host must recompute current prices/tax/stock and commit a real invoice once.
 * No third-party code copied; all calendar arithmetic is native UTC.
 */
export type RecurringInvoiceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringInvoiceStatus = "active" | "paused" | "cancelled";

export interface RecurringInvoiceLine {
  readonly productId: string;
  /** Positive integer thousandths, not floating point money. */
  readonly quantityMilli: number;
}
export interface RecurringInvoiceInput {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly sourceSaleId: string;
  readonly currency: string;
  readonly firstDueDate: string;
  readonly frequency: RecurringInvoiceFrequency;
  readonly interval?: number;
  readonly endDate?: string | null;
  readonly maxOccurrences?: number;
  readonly lines: readonly RecurringInvoiceLine[];
  readonly notes?: string;
}
export interface RecurringInvoiceSchedule extends Omit<RecurringInvoiceInput,
  "interval" | "maxOccurrences" | "endDate" | "notes"> {
  readonly interval: number;
  readonly maxOccurrences: number;
  readonly endDate: string | null;
  readonly notes: string;
  readonly status: RecurringInvoiceStatus;
  readonly version: number;
}
export interface RecurringInvoiceOccurrence {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly scheduleId: string;
  readonly sequence: number;
  readonly dueDate: string;
  readonly kind: "invoice_draft_pending_review";
}

const id = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 128 && v.length > 0 &&
  v === v.trim() && !/[\u0000-\u001f]/.test(v);
const positiveInt = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= max;

function parseDate(value: unknown): Date {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must be a YYYY-MM-DD value between 2000 and 2099");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid Gregorian calendar date");
  }
  return parsed;
}
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

function validateLines(lines: unknown): RecurringInvoiceLine[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw new Error("Recurring invoice requires 1 to 100 products");
  }
  return lines.map((line: unknown) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new Error("Invalid recurring invoice product line");
    }
    const value = line as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== "productId" && key !== "quantityMilli") ||
        !id(value.productId) || !positiveInt(value.quantityMilli, 1_000_000_000)) {
      throw new Error("Recurring invoice line needs productId and positive milli quantity");
    }
    return { productId: value.productId, quantityMilli: value.quantityMilli };
  });
}

export function createRecurringInvoiceSchedule(input: RecurringInvoiceInput): RecurringInvoiceSchedule {
  if (!input || typeof input !== "object") throw new Error("Missing recurring invoice rule");
  for (const value of [input.id, input.organizationId, input.companyId, input.branchId,
    input.customerId, input.sourceSaleId]) {
    if (!id(value)) throw new Error("Invalid recurring invoice tenant or document identity");
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("Currency must be ISO 4217 code");
  if (!["daily", "weekly", "monthly", "yearly"].includes(input.frequency)) {
    throw new Error("Unsupported recurring invoice frequency");
  }
  const interval = input.interval ?? 1;
  const maxOccurrences = input.maxOccurrences ?? 120;
  if (!positiveInt(interval, 12) || !positiveInt(maxOccurrences, 120)) {
    throw new Error("Recurring invoice interval/occurrence limit invalid");
  }
  const start = parseDate(input.firstDueDate);
  const endDate = input.endDate ?? null;
  if (endDate !== null && parseDate(endDate).getTime() < start.getTime()) {
    throw new Error("Recurring invoice end date precedes first due date");
  }
  if (typeof (input.notes ?? "") !== "string" || (input.notes ?? "").length > 1000) {
    throw new Error("Recurring invoice notes too long");
  }
  return {
    id: input.id, organizationId: input.organizationId, companyId: input.companyId,
    branchId: input.branchId, customerId: input.customerId,
    sourceSaleId: input.sourceSaleId, currency: input.currency,
    firstDueDate: input.firstDueDate, frequency: input.frequency,
    interval, maxOccurrences, endDate,
    lines: validateLines(input.lines), notes: input.notes ?? "",
    status: "active", version: 1,
  };
}

/** Month days are anchored to ORIGINAL day (Jan 31 -> Feb 28 -> Mar 31). */
export function recurringInvoiceDueDate(
  schedule: RecurringInvoiceSchedule, sequence: number,
): string {
  if (!positiveInt(sequence, schedule.maxOccurrences)) {
    throw new Error("Recurring invoice sequence is out of bounds");
  }
  const start = parseDate(schedule.firstDueDate);
  const offset = (sequence - 1) * schedule.interval;
  if (schedule.frequency === "daily" || schedule.frequency === "weekly") {
    const dayCount = offset * (schedule.frequency === "weekly" ? 7 : 1);
    const due = new Date(start.getTime() + dayCount * 86_400_000);
    if (due.getUTCFullYear() > 2099) throw new Error("Recurring invoice date overflows");
    return isoDate(due);
  }
  if (schedule.frequency !== "monthly" && schedule.frequency !== "yearly") {
    throw new Error("Invalid recurring invoice frequency");
  }
  const monthOffset = offset * (schedule.frequency === "yearly" ? 12 : 1);
  const monthStart = new Date(Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth() + monthOffset, 1,
  ));
  if (monthStart.getUTCFullYear() > 2099) throw new Error("Recurring invoice date overflows");
  const monthEnd = new Date(Date.UTC(
    monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0,
  )).getUTCDate();
  return isoDate(new Date(Date.UTC(
    monthStart.getUTCFullYear(), monthStart.getUTCMonth(),
    Math.min(start.getUTCDate(), monthEnd),
  )));
}

/**
 * Idempotent due-draft planning by stable (scheduleId, sequence).
 * existingSequences MUST be read by the trusted adapter within its transaction.
 * Never use untrusted renderer input as proof of an already-issued invoice.
 */
export function planRecurringInvoiceDue(
  schedule: RecurringInvoiceSchedule,
  asOfDate: string,
  existingSequences: readonly number[],
  maxNewDrafts = 12,
): RecurringInvoiceOccurrence[] {
  const check = createRecurringInvoiceSchedule(schedule);
  if (JSON.stringify({ ...check, status: schedule.status, version: schedule.version }) !==
      JSON.stringify(schedule) ||
      !positiveInt(schedule.version, 2_147_483_647) ||
      !["active", "paused", "cancelled"].includes(schedule.status)) {
    throw new Error("Invalid persisted recurring invoice schedule");
  }
  const asOf = parseDate(asOfDate);
  if (!Array.isArray(existingSequences) || !positiveInt(maxNewDrafts, 100)) {
    throw new Error("Invalid recurring invoice cursor or page limit");
  }
  const seen = new Set<number>();
  for (const n of existingSequences) {
    if (!positiveInt(n, schedule.maxOccurrences) || seen.has(n)) {
      throw new Error("Invalid or duplicate existing recurrence sequence");
    }
    seen.add(n);
  }
  if (schedule.status !== "active") return [];
  const result: RecurringInvoiceOccurrence[] = [];
  for (let sequence = 1; sequence <= schedule.maxOccurrences; sequence++) {
    const dueDate = recurringInvoiceDueDate(schedule, sequence);
    if (dueDate > asOfDate || (schedule.endDate !== null && dueDate > schedule.endDate)) break;
    if (seen.has(sequence)) continue;
    result.push({
      id: `${schedule.id}:${sequence}`, organizationId: schedule.organizationId,
      companyId: schedule.companyId, branchId: schedule.branchId,
      scheduleId: schedule.id, sequence, dueDate,
      kind: "invoice_draft_pending_review",
    });
    if (result.length >= maxNewDrafts) break;
  }
  // asOf's parsed value intentionally assures strict calendar validation.
  void asOf;
  return result;
}

export function changeRecurringInvoiceStatus(
  schedule: RecurringInvoiceSchedule,
  expectedVersion: number,
  next: RecurringInvoiceStatus,
): RecurringInvoiceSchedule {
  if (!positiveInt(expectedVersion, 2_147_483_647) || schedule.version !== expectedVersion) {
    throw new Error("Recurring invoice schedule revision conflict");
  }
  if (!["active", "paused", "cancelled"].includes(next)) {
    throw new Error("Invalid recurring invoice status");
  }
  if (schedule.status === "cancelled" && next !== "cancelled") {
    throw new Error("Cancelled recurring invoice cannot be reactivated");
  }
  if (schedule.status === next) return schedule;
  if (schedule.version === 2_147_483_647) throw new Error("Schedule version exhausted");
  return { ...schedule, status: next, version: schedule.version + 1 };
}
