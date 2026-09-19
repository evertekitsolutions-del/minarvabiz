/**
 * Double-entry accounting core.
 *
 * Step 4A deliberately separates accounting documents from sales/purchase
 * operational records. Later posting adapters can translate business events
 * into these journals without mixing transaction domains.
 */
import type {
  AccountingAccount,
  AccountingAccountType,
  GeneralLedgerRow,
  JournalEntry,
  JournalEntryLine,
  TrialBalanceRow,
  UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { enqueueOutbox } from "./outbox-bridge";
import { touchPersistence } from "./autosave";
import { remoteUpsertAccountingAccount, remoteUpsertJournalEntry } from "./remote-write";

const accounts: AccountingAccount[] = [];
const journals: JournalEntry[] = [];
let journalSequence = 0;

function r2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalBalance(type: AccountingAccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

const SYSTEM_ACCOUNTS: Array<{ id: UUID; code: string; name: string; type: AccountingAccountType; systemKey: string }> = [
  { id: "00000000-0000-4000-8000-000000000001", code: "1000", name: "Cash", type: "asset", systemKey: "cash" },
  { id: "00000000-0000-4000-8000-000000000002", code: "1010", name: "Bank", type: "asset", systemKey: "bank" },
  { id: "00000000-0000-4000-8000-000000000003", code: "1100", name: "Accounts Receivable", type: "asset", systemKey: "accounts_receivable" },
  { id: "00000000-0000-4000-8000-000000000004", code: "1200", name: "Inventory Asset", type: "asset", systemKey: "inventory_asset" },
  { id: "00000000-0000-4000-8000-000000000005", code: "1300", name: "Input Tax Credit", type: "asset", systemKey: "input_tax" },
  { id: "00000000-0000-4000-8000-000000000006", code: "2000", name: "Accounts Payable", type: "liability", systemKey: "accounts_payable" },
  { id: "00000000-0000-4000-8000-000000000007", code: "2100", name: "Tax Payable", type: "liability", systemKey: "tax_payable" },
  { id: "00000000-0000-4000-8000-000000000008", code: "3000", name: "Owner Equity", type: "equity", systemKey: "owner_equity" },
  { id: "00000000-0000-4000-8000-000000000009", code: "3100", name: "Opening Balance Equity", type: "equity", systemKey: "opening_balance_equity" },
  { id: "00000000-0000-4000-8000-000000000010", code: "4000", name: "Product Sales", type: "income", systemKey: "product_sales" },
  { id: "00000000-0000-4000-8000-000000000011", code: "4100", name: "Service Revenue", type: "income", systemKey: "service_revenue" },
  { id: "00000000-0000-4000-8000-000000000012", code: "4200", name: "Laundry Revenue", type: "income", systemKey: "laundry_revenue" },
  { id: "00000000-0000-4000-8000-000000000013", code: "5000", name: "Cost of Goods Sold", type: "expense", systemKey: "cogs" },
  { id: "00000000-0000-4000-8000-000000000014", code: "5100", name: "Material Costs", type: "expense", systemKey: "material_costs" },
  { id: "00000000-0000-4000-8000-000000000015", code: "5200", name: "Order-specific Expenses", type: "expense", systemKey: "order_expenses" },
  { id: "00000000-0000-4000-8000-000000000016", code: "5300", name: "Staff Incentives", type: "expense", systemKey: "staff_incentives" },
  { id: "00000000-0000-4000-8000-000000000017", code: "6000", name: "General Expenses", type: "expense", systemKey: "general_expenses" },
];

function seedSystemAccounts() {
  if (accounts.length) return;
  const now = nowISO();
  for (const item of SYSTEM_ACCOUNTS) {
    accounts.push({
      ...item,
      normalBalance: normalBalance(item.type),
      parentId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }
}
seedSystemAccounts();

function nextJournalNumber(): string {
  journalSequence += 1;
  return "JV-" + new Date().getFullYear() + "-" + String(journalSequence).padStart(6, "0");
}

function cloneEntry(entry: JournalEntry): JournalEntry {
  return { ...entry, lines: entry.lines.map((line) => ({ ...line })) };
}

export function listAccounts(includeInactive = false): AccountingAccount[] {
  return accounts
    .filter((account) => !account.deletedAt && (includeInactive || account.isActive))
    .map((account) => ({ ...account }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function getAccount(id: UUID): AccountingAccount | undefined {
  const account = accounts.find((candidate) => candidate.id === id && !candidate.deletedAt);
  return account ? { ...account } : undefined;
}

export function getSystemAccount(systemKey: string): AccountingAccount | undefined {
  const account = accounts.find((candidate) => candidate.systemKey === systemKey && !candidate.deletedAt);
  return account ? { ...account } : undefined;
}

export function createAccount(input: {
  code: string;
  name: string;
  type: AccountingAccountType;
  parentId?: UUID | null;
  branchId?: UUID | null;
}): { account: AccountingAccount | null; errors: string[] } {
  assertPermission("accounting.manage");
  const code = input.code.trim();
  const name = input.name.trim();
  const errors: string[] = [];
  if (!code) errors.push("Account code is required");
  if (!name) errors.push("Account name is required");
  if (accounts.some((account) => !account.deletedAt && account.code.toLowerCase() === code.toLowerCase())) {
    errors.push("Account code already exists");
  }
  if (input.parentId && !accounts.some((account) => account.id === input.parentId && !account.deletedAt)) {
    errors.push("Parent account not found");
  }
  if (errors.length) return { account: null, errors };
  const now = nowISO();
  const account: AccountingAccount = {
    id: generateId(),
    code,
    name,
    type: input.type,
    normalBalance: normalBalance(input.type),
    parentId: input.parentId ?? null,
    systemKey: null,
    isActive: true,
    branchId: input.branchId ?? null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  accounts.push(account);
  enqueueOutbox("accounts", account.id, "insert", account);
  void remoteUpsertAccountingAccount(account);
  auditAction("accounting.account.create", "accounts", account.id, null, account);
  touchPersistence();
  return { account: { ...account }, errors: [] };
}

export function setAccountActive(id: UUID, isActive: boolean): { account: AccountingAccount | null; error?: string } {
  assertPermission("accounting.manage");
  const account = accounts.find((candidate) => candidate.id === id && !candidate.deletedAt);
  if (!account) return { account: null, error: "Account not found" };
  if (account.systemKey && !isActive) return { account: null, error: "System accounts cannot be disabled" };
  const before = { ...account };
  account.isActive = isActive;
  account.updatedAt = nowISO();
  account.version += 1;
  enqueueOutbox("accounts", account.id, "update", account);
  void remoteUpsertAccountingAccount(account);
  auditAction("accounting.account.status", "accounts", account.id, before, account);
  touchPersistence();
  return { account: { ...account } };
}

function normalizeLines(entryId: UUID, input: Array<{ accountId: UUID; debit?: number; credit?: number; memo?: string | null }>): { lines: JournalEntryLine[]; errors: string[] } {
  const lines: JournalEntryLine[] = [];
  const errors: string[] = [];
  for (const item of input) {
    const account = accounts.find((candidate) => candidate.id === item.accountId && !candidate.deletedAt && candidate.isActive);
    if (!account) { errors.push("Active account not found"); continue; }
    const debit = r2(Math.max(0, Number(item.debit) || 0));
    const credit = r2(Math.max(0, Number(item.credit) || 0));
    if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
      errors.push(account.code + " " + account.name + ": enter either debit or credit");
      continue;
    }
    lines.push({
      id: generateId(),
      journalEntryId: entryId,
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      debit,
      credit,
      memo: item.memo?.trim() || null,
    });
  }
  return { lines, errors };
}

function balanceErrors(lines: JournalEntryLine[]): string[] {
  const errors: string[] = [];
  if (lines.length < 2) errors.push("A journal entry needs at least two valid lines");
  const debit = r2(lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = r2(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debit <= 0 || credit <= 0) errors.push("Journal must contain both debit and credit");
  if (Math.abs(debit - credit) > 0.009) errors.push("Journal is not balanced: debit " + debit.toFixed(2) + " vs credit " + credit.toFixed(2));
  return errors;
}

export function createJournalEntry(input: {
  entryDate?: string;
  description: string;
  referenceType?: string | null;
  referenceId?: UUID | null;
  lines: Array<{ accountId: UUID; debit?: number; credit?: number; memo?: string | null }>;
  branchId?: UUID | null;
  createdBy?: UUID | null;
}): { journalEntry: JournalEntry | null; errors: string[] } {
  assertPermission("accounting.manage");
  const description = input.description.trim();
  if (!description) return { journalEntry: null, errors: ["Journal description is required"] };
  const id = generateId();
  const normalized = normalizeLines(id, input.lines);
  if (normalized.errors.length) return { journalEntry: null, errors: normalized.errors };
  const now = nowISO();
  const totalDebit = r2(normalized.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = r2(normalized.lines.reduce((sum, line) => sum + line.credit, 0));
  const journalEntry: JournalEntry = {
    id,
    journalNumber: nextJournalNumber(),
    entryDate: input.entryDate || now.slice(0, 10),
    description,
    referenceType: input.referenceType ?? "manual",
    referenceId: input.referenceId ?? null,
    status: "draft",
    lines: normalized.lines,
    totalDebit,
    totalCredit,
    branchId: input.branchId ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  journals.unshift(journalEntry);
  enqueueOutbox("journal_entries", journalEntry.id, "insert", journalEntry);
  for (const line of journalEntry.lines) enqueueOutbox("journal_entry_lines", line.id, "insert", line);
  void remoteUpsertJournalEntry(cloneEntry(journalEntry));
  auditAction("accounting.journal.create", "journal_entries", journalEntry.id, null, journalEntry);
  touchPersistence();
  return { journalEntry: cloneEntry(journalEntry), errors: [] };
}

export function listJournalEntries(): JournalEntry[] {
  return journals.map(cloneEntry).sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
}

export function getJournalEntry(id: UUID): JournalEntry | undefined {
  const entry = journals.find((candidate) => candidate.id === id);
  return entry ? cloneEntry(entry) : undefined;
}

export function postJournalEntry(id: UUID): { journalEntry: JournalEntry | null; errors: string[] } {
  assertPermission("accounting.manage");
  const entry = journals.find((candidate) => candidate.id === id);
  if (!entry) return { journalEntry: null, errors: ["Journal entry not found"] };
  if (entry.status !== "draft") return { journalEntry: null, errors: ["Only draft journals can be posted"] };
  const errors = balanceErrors(entry.lines);
  if (errors.length) return { journalEntry: null, errors };
  const before = cloneEntry(entry);
  entry.status = "posted";
  entry.postedAt = nowISO();
  entry.updatedAt = nowISO();
  entry.version += 1;
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  void remoteUpsertJournalEntry(cloneEntry(entry));
  auditAction("accounting.journal.post", "journal_entries", entry.id, before, entry);
  touchPersistence();
  return { journalEntry: cloneEntry(entry), errors: [] };
}

export function voidJournalEntry(id: UUID): { original: JournalEntry | null; reversal: JournalEntry | null; errors: string[] } {
  assertPermission("accounting.manage");
  const original = journals.find((candidate) => candidate.id === id);
  if (!original) return { original: null, reversal: null, errors: ["Journal entry not found"] };
  if (original.status !== "posted") return { original: null, reversal: null, errors: ["Only posted journals can be voided"] };

  const now = nowISO();
  const reversalId = generateId();
  const reversalLines: JournalEntryLine[] = original.lines.map((line) => ({
    id: generateId(),
    journalEntryId: reversalId,
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.credit,
    credit: line.debit,
    memo: "Reversal of " + original.journalNumber,
  }));
  const reversal: JournalEntry = {
    id: reversalId,
    journalNumber: nextJournalNumber(),
    entryDate: now.slice(0, 10),
    description: "Reversal of " + original.journalNumber + " — " + original.description,
    referenceType: "journal_reversal",
    referenceId: original.id,
    status: "posted",
    lines: reversalLines,
    totalDebit: original.totalCredit,
    totalCredit: original.totalDebit,
    postedAt: now,
    branchId: original.branchId ?? null,
    createdBy: original.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const before = cloneEntry(original);
  original.status = "void";
  original.voidedAt = now;
  original.reversalJournalId = reversal.id;
  original.updatedAt = now;
  original.version += 1;
  journals.unshift(reversal);

  enqueueOutbox("journal_entries", original.id, "update", original);
  enqueueOutbox("journal_entries", reversal.id, "insert", reversal);
  for (const line of reversal.lines) enqueueOutbox("journal_entry_lines", line.id, "insert", line);
  void remoteUpsertJournalEntry(cloneEntry(original));
  void remoteUpsertJournalEntry(cloneEntry(reversal));
  auditAction("accounting.journal.void", "journal_entries", original.id, before, original);
  auditAction("accounting.journal.reversal", "journal_entries", reversal.id, null, reversal);
  touchPersistence();
  return { original: cloneEntry(original), reversal: cloneEntry(reversal), errors: [] };
}

function reportableEntries(asOf?: string): JournalEntry[] {
  return journals.filter((entry) => {
    if (entry.status !== "posted" && entry.status !== "void") return false;
    if (asOf && entry.entryDate > asOf) return false;
    return true;
  });
}

export function buildTrialBalance(asOf?: string): TrialBalanceRow[] {
  assertPermission("accounting.view");
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const entry of reportableEntries(asOf)) {
    for (const line of entry.lines) {
      const row = totals.get(line.accountId) || { debit: 0, credit: 0 };
      row.debit = r2(row.debit + line.debit);
      row.credit = r2(row.credit + line.credit);
      totals.set(line.accountId, row);
    }
  }
  return listAccounts(true).map((account) => {
    const total = totals.get(account.id) || { debit: 0, credit: 0 };
    const net = r2(total.debit - total.credit);
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      debit: net >= 0 ? net : 0,
      credit: net < 0 ? Math.abs(net) : 0,
    };
  }).filter((row) => row.debit !== 0 || row.credit !== 0);
}

export function buildGeneralLedger(accountId: UUID, from?: string, to?: string): GeneralLedgerRow[] {
  assertPermission("accounting.view");
  const account = accounts.find((candidate) => candidate.id === accountId && !candidate.deletedAt);
  if (!account) return [];
  const all = reportableEntries(to).sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const rows: GeneralLedgerRow[] = [];
  for (const entry of all) {
    for (const line of entry.lines.filter((candidate) => candidate.accountId === accountId)) {
      const signed = account.normalBalance === "debit" ? line.debit - line.credit : line.credit - line.debit;
      running = r2(running + signed);
      if (!from || entry.entryDate >= from) {
        rows.push({
          journalEntryId: entry.id,
          journalNumber: entry.journalNumber,
          entryDate: entry.entryDate,
          description: entry.description,
          debit: line.debit,
          credit: line.credit,
          runningBalance: running,
          status: entry.status,
        });
      }
    }
  }
  return rows;
}

export function hydrateAccountingState(input: {
  accounts?: AccountingAccount[];
  journals?: JournalEntry[];
  journalSequence?: number;
}) {
  if (input.accounts) {
    accounts.length = 0;
    accounts.push(...input.accounts.map((account) => ({ ...account })));
  }
  if (input.journals) {
    journals.length = 0;
    journals.push(...input.journals.map(cloneEntry));
  }
  if (typeof input.journalSequence === "number") journalSequence = input.journalSequence;
  seedSystemAccounts();
}

export function exportAccountingState() {
  return {
    accounts: accounts.map((account) => ({ ...account })),
    journals: journals.map(cloneEntry),
    journalSequence,
  };
}
