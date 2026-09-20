/**
 * Double-entry accounting core.
 *
 * Step 4A deliberately separates accounting documents from sales/purchase
 * operational records. Later posting adapters can translate business events
 * into these journals without mixing transaction domains.
 */
import type {
  AccountingAccount,
  Expense,
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
import { touchPersistence } from "./autosave";
import { remoteUpsertAccountingAccount, remoteUpsertJournalEntry, remoteCreateExpenseWithJournal, remoteAutomaticPosting } from "./remote-write";

import { calculateProfitAndLoss, calculateBalanceSheet } from "./accounting-statements";

const accounts: AccountingAccount[] = [];
const journals: JournalEntry[] = [];
let journalSequence = 0;

function r2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalBalance(type: AccountingAccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

const SYSTEM_ACCOUNTS: Array<{ code: string; name: string; type: AccountingAccountType; systemKey: string }> = [
  { code: "1000", name: "Cash", type: "asset", systemKey: "cash" },
  { code: "1010", name: "Bank", type: "asset", systemKey: "bank" },
  { code: "1020", name: "Payment Clearing", type: "asset", systemKey: "payment_clearing" },
  { code: "1090", name: "Legacy / Unallocated Settlement Clearing", type: "asset", systemKey: "legacy_settlement_clearing" },
  { code: "2200", name: "Exchange Credit Payable", type: "liability", systemKey: "exchange_credit" },
  { code: "1100", name: "Accounts Receivable", type: "asset", systemKey: "accounts_receivable" },
  { code: "1200", name: "Inventory Asset", type: "asset", systemKey: "inventory_asset" },
  { code: "1250", name: "Unclassified Purchases", type: "asset", systemKey: "unclassified_purchases" },
  { code: "1260", name: "Purchase Returns Pending Review", type: "asset", systemKey: "purchase_returns_pending" },
  { code: "1310", name: "Purchase Tax Pending Review", type: "asset", systemKey: "purchase_tax_pending" },
  { code: "1300", name: "Input Tax Credit", type: "asset", systemKey: "input_tax" },
  { code: "2000", name: "Accounts Payable", type: "liability", systemKey: "accounts_payable" },
  { code: "2100", name: "Tax Payable", type: "liability", systemKey: "tax_payable" },
  { code: "3000", name: "Owner Equity", type: "equity", systemKey: "owner_equity" },
  { code: "3100", name: "Opening Balance Equity", type: "equity", systemKey: "opening_balance_equity" },
  { code: "4000", name: "Product Sales", type: "income", systemKey: "product_sales" },
  { code: "4100", name: "Service Revenue", type: "income", systemKey: "service_revenue" },
  { code: "4200", name: "Laundry Revenue", type: "income", systemKey: "laundry_revenue" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", systemKey: "cogs" },
  { code: "5100", name: "Material Costs", type: "expense", systemKey: "material_costs" },
  { code: "5200", name: "Order-specific Expenses", type: "expense", systemKey: "order_expenses" },
  { code: "5300", name: "Staff Incentives", type: "expense", systemKey: "staff_incentives" },
  { code: "6000", name: "General Expenses", type: "expense", systemKey: "general_expenses" },
];

function seedSystemAccounts() {
  if (accounts.length) return;
  const now = nowISO();
  for (const item of SYSTEM_ACCOUNTS) {
    accounts.push({
      ...item,
      id: generateId(),
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
  void remoteUpsertAccountingAccount(account);
  auditAction("accounting.account.status", "accounts", account.id, before, account);
  touchPersistence();
  return { account: { ...account } };
}

function validJournalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function validJournalAmount(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100));
}

function normalizeLines(entryId: UUID, input: Array<{ accountId: UUID; debit?: number; credit?: number; memo?: string | null }>): { lines: JournalEntryLine[]; errors: string[] } {
  const lines: JournalEntryLine[] = [];
  const errors: string[] = [];
  for (const item of input) {
    const account = accounts.find((candidate) => candidate.id === item.accountId && !candidate.deletedAt && candidate.isActive);
    if (!account) { errors.push("Active account not found"); continue; }
    if (![item.debit ?? 0, item.credit ?? 0].every(validJournalAmount)) {
      errors.push("Journal amounts must be finite, non-negative and within the supported range");
      continue;
    }
    const debit = r2(item.debit ?? 0);
    const credit = r2(item.credit ?? 0);
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
  if (![debit, credit].every(validJournalAmount)) errors.push("Journal totals exceed the supported range");
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
  const entryDate = input.entryDate ?? nowISO().slice(0, 10);
  if (!validJournalDate(entryDate)) return { journalEntry: null, errors: ["Invalid journal date"] };
  if (!input.lines.length) return { journalEntry: null, errors: ["Journal lines are required"] };
  const id = generateId();
  const normalized = normalizeLines(id, input.lines);
  if (normalized.errors.length) return { journalEntry: null, errors: normalized.errors };
  const now = nowISO();
  const totalDebit = r2(normalized.lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = r2(normalized.lines.reduce((sum, line) => sum + line.credit, 0));
  if (![totalDebit, totalCredit].every(validJournalAmount)) return { journalEntry: null, errors: ["Journal totals exceed the supported range"] };
  const journalEntry: JournalEntry = {
    id,
    journalNumber: nextJournalNumber(),
    entryDate,
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
  for (const accountId of [...new Set(journalEntry.lines.map((line) => line.accountId))]) {
    const account = accounts.find((candidate) => candidate.id === accountId);
    if (account) void remoteUpsertAccountingAccount(account);
  }
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
  const errors = normalizeLines(entry.id, entry.lines).errors;
  errors.push(...balanceErrors(entry.lines));
  if (!validJournalDate(entry.entryDate)) errors.push("Invalid journal date");
  if (!entry.description.trim()) errors.push("Journal description is required");
  if (entry.lines.some(line => line.debit !== r2(line.debit) || line.credit !== r2(line.credit))
    || entry.totalDebit !== r2(entry.lines.reduce((sum, line) => sum + line.debit, 0))
    || entry.totalCredit !== r2(entry.lines.reduce((sum, line) => sum + line.credit, 0))) errors.push("Draft journal totals need reconciliation");
  if (errors.length) return { journalEntry: null, errors };
  const before = cloneEntry(entry);
  entry.status = "posted";
  entry.postedAt = nowISO();
  entry.updatedAt = nowISO();
  entry.version += 1;
  void remoteUpsertJournalEntry(cloneEntry(entry));
  auditAction("accounting.journal.post", "journal_entries", entry.id, before, entry);
  touchPersistence();
  return { journalEntry: cloneEntry(entry), errors: [] };
}

export function voidJournalEntry(id: UUID): { original: JournalEntry | null; reversal: JournalEntry | null; errors: string[] } {
  assertPermission("accounting.manage");
  const original = journals.find((candidate) => candidate.id === id);
  if (!original) return { original: null, reversal: null, errors: ["Journal entry not found"] };
  if (original.referenceType === "expense" || AUTOMATIC_SALES_REFERENCES.includes(original.referenceType ?? "")) return { original: null, reversal: null, errors: ["Automatic source journals must be corrected through their source workflow"] };
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

export function buildProfitAndLoss(from?: string, to?: string) {
  assertPermission("accounting.view");
  return calculateProfitAndLoss(accounts, journals, from, to);
}

export function buildBalanceSheet(asOf?: string) {
  assertPermission("accounting.view");
  return calculateBalanceSheet(accounts, journals, asOf);
}

/** Post a newly created paid expense once, under expense permissions. */
export function postExpenseJournal(expense: Expense): { journalEntry: JournalEntry | null; errors: string[] } {
  assertPermission("expenses.manage");
  const amount = r2(expense.amount);
  const entryDate = String(expense.date).slice(0, 10);
  if (!expense.id || expense.deletedAt || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { journalEntry: null, errors: ["Expense requires a valid ID and positive finite amount"] };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isFinite(Date.parse(entryDate)) || new Date(entryDate).toISOString().slice(0, 10) !== entryDate) {
    return { journalEntry: null, errors: ["Expense date is invalid"] };
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(expense.paymentMethod)) {
    return { journalEntry: null, errors: ["Expense payment method is invalid"] };
  }
  const debitKey = expense.orderId ? "order_expenses" : "general_expenses";
  const creditKey = expense.paymentMethod === "cash" ? "cash" : expense.paymentMethod === "bank" ? "bank" : "payment_clearing";
  const existing = journals.find((entry) => entry.referenceType === "expense" && entry.referenceId === expense.id);
  if (existing) {
    const debitAccount = accounts.find((account) => account.systemKey === debitKey);
    const creditAccount = accounts.find((account) => account.systemKey === creditKey);
    const matches = existing.status === "posted" && existing.entryDate === entryDate && existing.totalDebit === amount && existing.totalCredit === amount
      && existing.lines.length === 2 && existing.lines.some((line) => line.accountId === debitAccount?.id && line.debit === amount)
      && existing.lines.some((line) => line.accountId === creditAccount?.id && line.credit === amount);
    return matches ? { journalEntry: cloneEntry(existing), errors: [] } : { journalEntry: null, errors: ["Expense already has a different accounting posting"] };
  }
  const postingAccounts: AccountingAccount[] = [];
  const now = nowISO();
  for (const key of [debitKey, creditKey]) {
    const template = SYSTEM_ACCOUNTS.find((item) => item.systemKey === key)!;
    const existingAccount = accounts.find((account) => account.systemKey === key);
    if (existingAccount && (!existingAccount.isActive || existingAccount.deletedAt || existingAccount.type !== template.type)) {
      return { journalEntry: null, errors: ["Expense posting account is unavailable: " + template.name] };
    }
    if (!existingAccount && accounts.some((account) => account.code === template.code)) {
      return { journalEntry: null, errors: ["Expense posting account code is already in use: " + template.code] };
    }
    postingAccounts.push(existingAccount || { ...template, id: generateId(), normalBalance: normalBalance(template.type), parentId: null,
      isActive: true, createdAt: now, updatedAt: now, version: 1 });
  }
  const id = generateId();
  const entry: JournalEntry = {
    id, journalNumber: nextJournalNumber(), entryDate,
    description: "Expense: " + (expense.description?.trim() || expense.categoryName || expense.id),
    referenceType: "expense", referenceId: expense.id, status: "posted", postedAt: now,
    totalDebit: amount, totalCredit: amount, branchId: expense.branchId ?? null, createdBy: expense.createdBy ?? null,
    createdAt: now, updatedAt: now, version: 1,
    lines: postingAccounts.map((account, index) => ({ id: generateId(), journalEntryId: id, accountId: account.id,
      accountCode: account.code, accountName: account.name, debit: index === 0 ? amount : 0, credit: index === 1 ? amount : 0,
      memo: expense.reference || null })),
  };
  for (const account of postingAccounts) if (!accounts.some((candidate) => candidate.id === account.id)) accounts.push(account);
  journals.unshift(entry);
  void remoteCreateExpenseWithJournal({ ...expense }, postingAccounts.map((account) => ({ ...account })), cloneEntry(entry));
  auditAction("accounting.expense.post", "journal_entries", entry.id, null, cloneEntry(entry));
  touchPersistence();
  return { journalEntry: cloneEntry(entry), errors: [] };
}

export type AutomaticPostingLine = { key: string; debit?: number; credit?: number };
export type AutomaticPostingPlan = { errors: string[]; commit: () => JournalEntry | null };
export const AUTOMATIC_SALES_REFERENCES = ['auto_sale', 'auto_collection', 'auto_return', 'auto_exchange_refund', 'auto_purchase_invoice', 'auto_purchase_cancel', 'auto_supplier_payment', 'auto_direct_purchase', 'auto_purchase_return', 'auto_opening_cash', 'auto_opening_customer'];
export function hasSalePosting(saleId: UUID): boolean {
  return journals.some(j => j.referenceType === 'auto_sale' && j.referenceId === saleId && j.status === 'posted');
}

/** Validate everything before the source mutation; commit is synchronous and repeatable. */
export function planAutomaticPosting(input: {
  referenceType: string; referenceId: UUID; date: string; description: string;
  branchId?: UUID | null; lines: AutomaticPostingLine[];
}): AutomaticPostingPlan {
  assertPermission(['auto_opening_cash', 'auto_opening_customer'].includes(input.referenceType) ? 'settings.manage' : ['auto_purchase_invoice', 'auto_purchase_cancel', 'auto_supplier_payment', 'auto_direct_purchase', 'auto_purchase_return'].includes(input.referenceType) ? 'purchases.manage' : input.referenceType === 'auto_sale' ? 'sales.create' : input.referenceType === 'auto_collection' ? 'payments.collect' : 'returns.manage');
  const fail = (message: string): AutomaticPostingPlan => ({ errors: [message], commit: () => null });
  if (!AUTOMATIC_SALES_REFERENCES.includes(input.referenceType) || !input.referenceId) return fail('Invalid automatic posting source');
  const entryDate = input.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isFinite(Date.parse(entryDate)) || new Date(entryDate).toISOString().slice(0, 10) !== entryDate) return fail('Invalid posting date');
  const grouped = new Map<string, { debit: number; credit: number }>();
  for (const line of input.lines) {
    const debit = Math.round((line.debit ?? 0) * 100), credit = Math.round((line.credit ?? 0) * 100);
    if (![debit, credit].every(n => Number.isSafeInteger(n) && n >= 0)) return fail('Invalid automatic posting amount');
    const previous = grouped.get(line.key) ?? { debit: 0, credit: 0 };
    grouped.set(line.key, { debit: previous.debit + debit, credit: previous.credit + credit });
  }
  const amounts = [...grouped].filter(([, v]) => v.debit || v.credit).sort(([a], [b]) => a.localeCompare(b));
  const debit = amounts.reduce((sum, [, v]) => sum + v.debit, 0), credit = amounts.reduce((sum, [, v]) => sum + v.credit, 0);
  if (!Number.isSafeInteger(debit) || debit !== credit) return fail('Automatic posting is not balanced');
  if (!amounts.length) return { errors: [], commit: () => null };
  const now = nowISO();
  const plannedAccounts: AccountingAccount[] = [];
  for (const [key] of amounts) {
    const template = SYSTEM_ACCOUNTS.find(a => a.systemKey === key);
    if (!template) return fail('Unknown posting account: ' + key);
    const account = accounts.find(a => a.systemKey === key);
    if (account && (account.deletedAt || !account.isActive || account.type !== template.type)) return fail('Posting account unavailable: ' + template.name);
    if (!account && accounts.some(a => a.code === template.code)) return fail('Posting account code is in use: ' + template.code);
    plannedAccounts.push(account ?? { ...template, id: generateId(), normalBalance: normalBalance(template.type), isActive: true, createdAt: now, updatedAt: now, version: 1 });
  }
  const existing = journals.find(j => j.referenceType === input.referenceType && j.referenceId === input.referenceId);
  if (existing) {
    const matches = existing.status === 'posted' && existing.entryDate === entryDate && existing.branchId === (input.branchId ?? null)
      && existing.lines.length === amounts.length && amounts.every(([key, value]) => existing.lines.some(l =>
        l.accountId === plannedAccounts.find(a => a.systemKey === key)?.id && Math.round(l.debit * 100) === value.debit && Math.round(l.credit * 100) === value.credit));
    return matches ? { errors: [], commit: () => cloneEntry(existing) } : fail('Source already has a different accounting posting');
  }
  let committed: JournalEntry | null = null;
  return { errors: [], commit: () => {
    if (committed) return cloneEntry(committed);
    const id = generateId();
    const entry: JournalEntry = {
      id, journalNumber: nextJournalNumber(), entryDate, description: input.description,
      referenceType: input.referenceType, referenceId: input.referenceId, branchId: input.branchId ?? null,
      status: 'posted', postedAt: now, createdAt: now, updatedAt: now, version: 1,
      totalDebit: debit / 100, totalCredit: credit / 100,
      lines: amounts.map(([key, value]) => {
        const planned = plannedAccounts.find(a => a.systemKey === key)!;
        const account = accounts.find(a => a.systemKey === key) ?? planned;
        return { id: generateId(), journalEntryId: id, accountId: account.id, accountCode: account.code, accountName: account.name, debit: value.debit / 100, credit: value.credit / 100 };
      }),
    };
    for (const account of plannedAccounts) if (!accounts.some(a => a.systemKey === account.systemKey)) accounts.push(account);
    journals.unshift(entry); committed = entry;
    void remoteAutomaticPosting(entry.lines.map(l => ({ ...accounts.find(a => a.id === l.accountId)! })), cloneEntry(entry));
    auditAction('accounting.source.post', 'journal_entries', entry.id, null, cloneEntry(entry));
    touchPersistence();
    return cloneEntry(entry);
  } };
}
