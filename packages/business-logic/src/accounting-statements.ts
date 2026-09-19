import type { AccountingAccount, JournalEntry } from "@minarvabiz/types";

export interface StatementRow {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

function validateDate(value?: string) {
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
    throw new Error("Choose a valid statement date");
  }
}

// Accumulate integer minor units so report totals do not drift across many lines.
function balances(accounts: AccountingAccount[], journals: JournalEntry[], from?: string, to?: string) {
  validateDate(from);
  validateDate(to);
  if (from && to && from > to) throw new Error("Statement start date must be on or before end date");
  const totals = new Map<string, number>();
  const known = new Set(accounts.map((account) => account.id));
  for (const entry of journals) {
    // A voided original remains in the ledger alongside its dated reversal.
    if (entry.status !== "posted" && entry.status !== "void") continue;
    if ((from && entry.entryDate < from) || (to && entry.entryDate > to)) continue;
    for (const line of entry.lines) {
      if (!known.has(line.accountId)) throw new Error("Statement contains an unknown account; restore or sync the chart of accounts");
      if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit)) throw new Error("Statement contains an invalid journal amount");
      totals.set(line.accountId, (totals.get(line.accountId) || 0) + Math.round(line.debit * 100) - Math.round(line.credit * 100));
    }
  }
  return totals;
}

function rows(accounts: AccountingAccount[], totals: Map<string, number>, type: AccountingAccount["type"]): StatementRow[] {
  const sign = type === "asset" || type === "expense" ? 1 : -1;
  // Include inactive accounts: disabling an account must not erase its history.
  return accounts.filter((a) => a.type === type).map((a) => ({
    accountId: a.id, code: a.code, name: a.name, amount: sign * (totals.get(a.id) || 0) / 100,
  })).filter((row) => row.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
}
const sum = (items: StatementRow[]) => items.reduce((total, row) => total + Math.round(row.amount * 100), 0) / 100;
const round = (value: number) => Math.round(value * 100) / 100;

export function calculateProfitAndLoss(accounts: AccountingAccount[], journals: JournalEntry[], from?: string, to?: string) {
  const totals = balances(accounts, journals, from, to);
  const income = rows(accounts, totals, "income");
  const expenses = rows(accounts, totals, "expense");
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  return { income, expenses, totalIncome, totalExpenses, netProfit: round(totalIncome - totalExpenses) };
}

export function calculateBalanceSheet(accounts: AccountingAccount[], journals: JournalEntry[], asOf?: string) {
  const totals = balances(accounts, journals, undefined, asOf);
  const assets = rows(accounts, totals, "asset");
  const liabilities = rows(accounts, totals, "liability");
  const equity = rows(accounts, totals, "equity");
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const recordedEquity = sum(equity);
  const unclosedEarnings = round(sum(rows(accounts, totals, "income")) - sum(rows(accounts, totals, "expense")));
  const totalEquity = round(recordedEquity + unclosedEarnings);
  const liabilitiesAndEquity = round(totalLiabilities + totalEquity);
  const difference = round(totalAssets - liabilitiesAndEquity);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, recordedEquity, unclosedEarnings, totalEquity, liabilitiesAndEquity, difference, balanced: difference === 0 };
}
