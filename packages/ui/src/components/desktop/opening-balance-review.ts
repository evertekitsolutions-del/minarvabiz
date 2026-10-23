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
      // Financial amounts must stay numeric, including negative credit balances.
      // Only untrusted party identifiers and names need spreadsheet-text escaping.
      const recorded = money(party.outstandingBalance, type + " " + party.id + " outstanding balance");
      lines.push([type, csvCell(party.id), csvCell(party.name), recorded, "", "PENDING", ""].join(","));
    }
  };
  append("customer", input.customers);
  append("supplier", input.suppliers);
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}


export type OpeningBalanceReviewState = "matched" | "discrepancy" | "pending";
export interface OpeningBalanceReviewRow {
  kind: "customer" | "supplier";
  id: string;
  name: string;
  current: number;
  verified: number | null;
  difference: number | null;
  state: OpeningBalanceReviewState;
}
export interface OpeningBalanceReviewResult {
  ok: boolean;
  total: number;
  matched: number;
  discrepancies: number;
  pending: number;
  rows: OpeningBalanceReviewRow[];
  errors: string[];
}

/** Strict RFC4180-style records with quoted commas/newlines. Never executes spreadsheet content. */
function parseReviewRecords(text: string): string[][] {
  if (text.length > 8 * 1024 * 1024) throw new Error("Worksheet exceeds 8 Mi characters.");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  const finishField = () => {
    row.push(field);
    field = "";
    state = "start";
  };
  const finishRecord = () => {
    finishField();
    if (row.some(value => value !== "")) {
      if (records.length >= 50_001) throw new Error("Worksheet exceeds 50,000 parties.");
      records.push(row);
    }
    row = [];
  };
  const source = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else state = "closed";
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      if (state !== "start") throw new Error("Invalid quote in balance review CSV.");
      state = "quoted";
      continue;
    }
    if (ch === ",") { finishField(); continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      finishRecord();
      continue;
    }
    if (state === "closed") {
      if (ch === " " || ch === "\t") continue;
      throw new Error("Unexpected characters after closing CSV quote.");
    }
    field += ch;
    state = "plain";
  }
  if (state === "quoted") throw new Error("Unclosed CSV quoted field.");
  if (field || row.length || state === "closed") finishRecord();
  return records;
}

/** Accept exact decimal units, never JS parseFloat truncation or spreadsheet formulas. */
function csvMoneyToMinor(raw: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/u.test(raw) || raw.length > 22) {
    throw new Error("Balance must be a plain two-decimal number.");
  }
  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Balance exceeds accounting limits.");
  const value = Number(minor);
  return negative ? -value : value;
}

const reviewKey = (kind: string, id: string): string => JSON.stringify([kind, id]);

/**
 * Reconcile a returned operator worksheet against *current* local balances.
 * Reject missing/foreign/duplicate parties, tampering, stale balances and invalid
 * money; no domain mutation, no UAT claims, no automatic journal entries.
 */
export function compareOpeningBalanceReviewCsv(
  csv: string,
  input: OutstandingReviewInput,
): OpeningBalanceReviewResult {
  const rows: OpeningBalanceReviewRow[] = [];
  const errors: string[] = [];
  const result = (): OpeningBalanceReviewResult => ({
    ok: errors.length === 0, total: input.customers.length + input.suppliers.length,
    matched: rows.filter(row => row.state === "matched").length,
    discrepancies: rows.filter(row => row.state === "discrepancy").length,
    pending: rows.filter(row => row.state === "pending").length,
    rows, errors,
  });
  let parsed: string[][];
  try { parsed = parseReviewRecords(csv); }
  catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return result();
  }
  if (!parsed.length || parsed[0].join(",") !== REVIEW_HEADER.join(",")) {
    errors.push("The review worksheet header is invalid or has been changed.");
    return result();
  }
  const expected = new Map<string, OutstandingReviewParty>();
  for (const [kind, parties] of [
    ["customer", input.customers],
    ["supplier", input.suppliers],
  ] as const) {
    for (const party of parties) {
      const key = reviewKey(kind, party.id);
      if (!party.id.trim() || expected.has(key)) {
        errors.push("Current party IDs are missing or duplicated; reconcile the local catalog.");
        return result();
      }
      expected.set(key, party);
    }
  }
  const seen = new Set<string>();
  for (let i = 1; i < parsed.length; i += 1) {
    const cells = parsed[i];
    if (cells.length !== REVIEW_HEADER.length) {
      if (errors.length < 30) errors.push("CSV row " + (i + 1) + " must contain seven columns.");
      continue;
    }
    const [kind, id, , snapshot, verified, status] = cells;
    const key = reviewKey(kind, id);
    const party = expected.get(key);
    if (!party || (kind !== "customer" && kind !== "supplier")) {
      if (errors.length < 30) errors.push("CSV row " + (i + 1) + " has an unknown party identity.");
      continue;
    }
    if (seen.has(key)) {
      if (errors.length < 30) errors.push("CSV row " + (i + 1) + " duplicates a party.");
      continue;
    }
    seen.add(key);
    try {
      const current = csvMoneyToMinor(money(party.outstandingBalance, "Current party balance"));
      if (csvMoneyToMinor(snapshot) !== current) throw new Error("Exported balance is stale or edited.");
      const state = status.trim().toUpperCase();
      if (!["PENDING", "VERIFIED"].includes(state)) throw new Error("Review status must be PENDING or VERIFIED.");
      if (state === "PENDING") {
        if (verified.trim()) throw new Error("Set review status to VERIFIED before entering a verified amount.");
        rows.push({ kind, id, name: party.name, current: current / 100, verified: null, difference: null, state: "pending" });
        continue;
      }
      const confirmed = csvMoneyToMinor(verified.trim());
      const delta = confirmed - current;
      if (!Number.isSafeInteger(delta)) throw new Error("Difference exceeds accounting limits.");
      rows.push({
        kind, id, name: party.name, current: current / 100,
        verified: confirmed / 100, difference: delta / 100,
        state: delta === 0 ? "matched" : "discrepancy",
      });
    } catch (error) {
      if (errors.length < 30) errors.push("CSV row " + (i + 1) + ": " +
        (error instanceof Error ? error.message : String(error)));
    }
  }
  for (const key of expected.keys()) {
    if (!seen.has(key)) {
      errors.push("Review worksheet is missing one or more current parties; download a fresh worksheet.");
      break;
    }
  }
  return result();
}
