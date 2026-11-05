/** File-only TallyPrime XML Journal voucher export.
 * Tally voucher import format: https://help.tallysolutions.com/sample-xml/
 * No HTTP calls, master creation, GST invoice mapping or import-status claims.
 */
import type { JournalEntry } from "@minarvabiz/types";
import { toMinorUnits } from "@minarvabiz/utils";

export interface TallyJournalExportOptions {
  companyName: string;
  from: string;
  through: string;
  /** Export only journals for the explicitly selected branch; legacy null belongs to HQ. */
  branchId?: string | null;
  headquartersBranchId?: string | null;
  /** Tally ledger masters must exist and their names must match exactly. */
  ledgerNamesByAccountCode?: Record<string, string>;
}

const validDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;

function xml(value: string): string {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error("Invalid XML text in accounting source");
  }
  return value.replace(/[<>&"']/g, char => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!
  ));
}
function minorAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    throw new Error("Journal contains an invalid two-decimal amount");
  }
  return toMinorUnits(value);
}
function entryVoucher(journal: JournalEntry, options: TallyJournalExportOptions): string {
  if (!journal.id || !journal.journalNumber || !validDay(journal.entryDate) || !journal.description?.trim()) {
    throw new Error("Posted journal identity, description or date is invalid");
  }
  const debit = journal.lines.map(line => minorAmount(line.debit));
  const credit = journal.lines.map(line => minorAmount(line.credit));
  if (journal.lines.length < 2 || journal.lines.some((_,i) => (debit[i] > 0 && credit[i] > 0) || (debit[i] === 0 && credit[i] === 0))) {
    throw new Error("Journal must have two or more non-zero single-sided ledger entries");
  }
  const totalDebit = debit.reduce((a,b) => a+b,0);
  const totalCredit = credit.reduce((a,b) => a+b,0);
  if (totalDebit <= 0 || totalDebit !== totalCredit
    || totalDebit !== minorAmount(journal.totalDebit) || totalCredit !== minorAmount(journal.totalCredit)) {
    throw new Error("Journal debit/credit totals need reconciliation before Tally export");
  }
  const lines = journal.lines.map((line,i) => {
    const mapped = options.ledgerNamesByAccountCode && Object.hasOwn(options.ledgerNamesByAccountCode,line.accountCode)
      ? options.ledgerNamesByAccountCode[line.accountCode] : line.accountName;
    const ledgerName = mapped?.trim();
    if (!ledgerName || ledgerName.length > 160) throw new Error("Tally ledger name missing for " + line.accountCode);
    const signed = (credit[i] - debit[i]) / 100;
    return "<ALLLEDGERENTRIES.LIST><LEDGERNAME>" + xml(ledgerName) + "</LEDGERNAME>"
      + "<ISDEEMEDPOSITIVE>" + (debit[i] > 0 ? "Yes" : "No") + "</ISDEEMEDPOSITIVE>"
      + "<AMOUNT>" + signed.toFixed(2) + "</AMOUNT></ALLLEDGERENTRIES.LIST>";
  }).join("");
  const number = "MB-" + journal.journalNumber;
  if (number.length > 80) throw new Error("Tally voucher number is too long");
  return '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Journal" ACTION="Create">'
    + "<DATE>" + journal.entryDate.replaceAll("-","") + "</DATE>"
    + "<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>"
    + "<VOUCHERNUMBER>" + xml(number) + "</VOUCHERNUMBER>"
    + "<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>"
    + "<NARRATION>" + xml(journal.description.trim() + " | Minarva source " + journal.id) + "</NARRATION>"
    + lines + "</VOUCHER></TALLYMESSAGE>";
}

/** Requires the operator to check Tally ledger masters and import preview; does not POST. */
export function buildTallyPrimeVoucherImportXml(
  journals: readonly JournalEntry[],
  options: TallyJournalExportOptions,
): { xml: string; voucherCount: number } {
  const company = options.companyName?.trim();
  if (!company || company.length > 160) throw new Error("Enter the exact target TallyPrime company name");
  if (!validDay(options.from) || !validDay(options.through) || options.from > options.through) {
    throw new Error("Choose a valid Tally export date range");
  }
  if (options.branchId && !options.headquartersBranchId) {
    throw new Error("Headquarters branch must be specified for branch-scoped Tally export");
  }
  const seen = new Set<string>(), numbers = new Set<string>();
  const vouchers: string[] = [];
  const sorted = journals.filter(entry => entry.status === "posted" && !entry.voidedAt)
    .filter(entry => entry.entryDate >= options.from && entry.entryDate <= options.through)
    .filter(entry => !options.branchId || (entry.branchId ?? options.headquartersBranchId) === options.branchId)
    .sort((a,b) => a.entryDate.localeCompare(b.entryDate) || a.journalNumber.localeCompare(b.journalNumber));
  for (const journal of sorted) {
    if (seen.has(journal.id) || numbers.has(journal.journalNumber)) {
      throw new Error("Duplicate journal identity or number in Tally export");
    }
    seen.add(journal.id);numbers.add(journal.journalNumber);
    vouchers.push(entryVoucher(journal,options));
  }
  if (!vouchers.length) throw new Error("No posted journals match the selected dates and branch");
  const result = '<?xml version="1.0" encoding="UTF-8"?>'
    + "<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST>"
    + "<TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DESC><STATICVARIABLES>"
    + "<SVCURRENTCOMPANY>" + xml(company) + "</SVCURRENTCOMPANY>"
    + "</STATICVARIABLES></DESC><DATA>" + vouchers.join("") + "</DATA></BODY></ENVELOPE>";
  return { xml: result, voucherCount: vouchers.length };
}
