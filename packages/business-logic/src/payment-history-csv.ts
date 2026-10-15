import type { Payment } from "@minarvabiz/types";

export type PaymentHistoryExportRow = Pick<
  Payment,
  | "id"
  | "paidAt"
  | "amount"
  | "method"
  | "referenceType"
  | "referenceId"
  | "notes"
> & {
  counterparty: string;
  direction: "inflow" | "outflow";
};

const HEADER = "date,payment_id,direction,counterparty,source,method,amount,signed_amount,reference_id,allocation_notes";

function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Payment history contains an invalid amount.");
    return String(value);
  }
  const text = value ?? "";
  // Payments can contain untrusted customer names and free-text references.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return /[",\r\n]/u.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

/** Pure CSV ledger extract; never modify or reconcile transactions during export. */
export function exportPaymentHistoryCsv(rows: readonly PaymentHistoryExportRow[]): string {
  const lines = rows.map((row) => {
    if (row.direction !== "inflow" && row.direction !== "outflow") {
      throw new Error("Payment history contains an invalid direction.");
    }
    if (!Number.isFinite(row.amount) || row.amount < 0 ||
      !Number.isSafeInteger(Math.round(row.amount * 100))) {
      throw new Error("Payment history contains an invalid amount.");
    }
    const signed = row.direction === "outflow" ? -row.amount : row.amount;
    return [
      row.paidAt,
      row.id,
      row.direction,
      row.counterparty,
      row.referenceType,
      row.method,
      row.amount,
      signed,
      row.referenceId,
      row.notes,
    ].map(csvCell).join(",");
  });
  return [HEADER, ...lines].join("\n") + "\n";
}
