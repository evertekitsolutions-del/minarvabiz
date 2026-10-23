/** First-customer review worksheet. This export never creates ledger postings or changes balances. */
export interface OutstandingReviewParty {
  id: string;
  name: string;
  outstandingBalance: number;
}
export interface OutstandingReviewInput {
  customers: readonly OutstandingReviewParty[];
  suppliers: readonly OutstandingReviewParty[];
}

const REVIEW_HEADER = [
  "party_type", "party_id", "party_name", "current_outstanding",
  "verified_outstanding", "review_status", "review_notes",
] as const;

/** Convert only accounting-representable values to a stable two-decimal string. */
function money(value: number, description: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(description + " is not a finite amount; reconcile it before export.");
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value - cents / 100) >
    Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(value)))) {
    throw new Error(description + " cannot be represented at the two-decimal ledger precision.");
  }
  return (cents / 100).toFixed(2);
}

function csvCell(value: string): string {
  // An imported party name/ID might be interpreted as a spreadsheet formula.
  // Prefixing an apostrophe preserves its visible text without evaluation.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value)
    ? "'" + value : value;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function buildOpeningBalanceReviewCsv(input: OutstandingReviewInput): string {
  if (input.customers.length + input.suppliers.length > 50_000) {
    throw new Error("Balance review worksheet is limited to 50,000 parties.");
  }
  const lines: string[] = [REVIEW_HEADER.join(",")];
  const append = (type: "customer" | "supplier", parties: readonly OutstandingReviewParty[]) => {
    for (const party of parties) {
      if (!party.id.trim()) throw new Error(type + " has no stable identity.");
      lines.push([
        type, party.id, party.name,
        money(party.outstandingBalance, type + " " + party.id + " outstanding balance"),
        "", "PENDING", "",
      ].map(csvCell).join(","));
    }
  };
  append("customer", input.customers);
  append("supplier", input.suppliers);
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
