import type { AccountingAccount, JournalEntry } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, subtractMinorUnits, toMinorUnits } from "@minarvabiz/utils";

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
      const debitMinor = toMinorUnits(line.debit);
      const creditMinor = toMinorUnits(line.credit);
      const netMinor = subtractMinorUnits(debitMinor, creditMinor);
      totals.set(line.accountId, addMinorUnits(totals.get(line.accountId) || 0, netMinor));
    }
  }
  return totals;
}

function rows(accounts: AccountingAccount[], totals: Map<string, number>, type: AccountingAccount["type"]): StatementRow[] {
  const sign = type === "asset" || type === "expense" ? 1 : -1;
  // Include inactive accounts: disabling an account must not erase its history.
  return accounts.filter((a) => a.type === type).map((a) => {
    const amountMinor = sign * (totals.get(a.id) || 0);
    return { accountId: a.id, code: a.code, name: a.name, amount: fromMinorUnits(amountMinor) };
  }).filter((row) => row.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
}

const sumMinor = (items: StatementRow[]) =>
  items.reduce((total, row) => addMinorUnits(total, toMinorUnits(row.amount)), 0);

export function calculateProfitAndLoss(accounts: AccountingAccount[], journals: JournalEntry[], from?: string, to?: string) {
  const totals = balances(accounts, journals, from, to);
  const income = rows(accounts, totals, "income");
  const expenses = rows(accounts, totals, "expense");
  const totalIncomeMinor = sumMinor(income);
  const totalExpensesMinor = sumMinor(expenses);
  return {
    income,
    expenses,
    totalIncome: fromMinorUnits(totalIncomeMinor),
    totalExpenses: fromMinorUnits(totalExpensesMinor),
    netProfit: fromMinorUnits(subtractMinorUnits(totalIncomeMinor, totalExpensesMinor)),
  };
}

export function calculateBalanceSheet(accounts: AccountingAccount[], journals: JournalEntry[], asOf?: string) {
  const totals = balances(accounts, journals, undefined, asOf);
  const assets = rows(accounts, totals, "asset");
  const liabilities = rows(accounts, totals, "liability");
  const equity = rows(accounts, totals, "equity");

  const totalAssetsMinor = sumMinor(assets);
  const totalLiabilitiesMinor = sumMinor(liabilities);
  const recordedEquityMinor = sumMinor(equity);
  const unclosedEarningsMinor = subtractMinorUnits(
    sumMinor(rows(accounts, totals, "income")),
    sumMinor(rows(accounts, totals, "expense"))
  );
  const totalEquityMinor = addMinorUnits(recordedEquityMinor, unclosedEarningsMinor);
  const liabilitiesAndEquityMinor = addMinorUnits(totalLiabilitiesMinor, totalEquityMinor);
  const differenceMinor = subtractMinorUnits(totalAssetsMinor, liabilitiesAndEquityMinor);

  return {
    assets,
    liabilities,
    equity,
    totalAssets: fromMinorUnits(totalAssetsMinor),
    totalLiabilities: fromMinorUnits(totalLiabilitiesMinor),
    recordedEquity: fromMinorUnits(recordedEquityMinor),
    unclosedEarnings: fromMinorUnits(unclosedEarningsMinor),
    totalEquity: fromMinorUnits(totalEquityMinor),
    liabilitiesAndEquity: fromMinorUnits(liabilitiesAndEquityMinor),
    difference: fromMinorUnits(differenceMinor),
    balanced: differenceMinor === 0,
  };
}
