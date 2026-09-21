"use client";

import * as React from "react";
import { accountingStore, setOpeningBank } from "@minarvabiz/business-logic";
import type { AccountingAccountType } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

type DraftJournalLine = { accountId: string; debit: string; credit: string; memo: string };

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyLine(): DraftJournalLine {
  return { accountId: "", debit: "", credit: "", memo: "" };
}

export function AccountingPanel() {
  const [tick, setTick] = React.useState(0);
  const [tab, setTab] = React.useState<"accounts" | "journal" | "trial" | "ledger" | "statements">("accounts");
  const [message, setMessage] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [accountForm, setAccountForm] = React.useState({ code: "", name: "", type: "expense" as AccountingAccountType });
  const [openingBankAmount, setOpeningBankAmount] = React.useState("");
  const [journalDate, setJournalDate] = React.useState(todayLocal());
  const [journalDescription, setJournalDescription] = React.useState("");
  const [journalLines, setJournalLines] = React.useState<DraftJournalLine[]>([emptyLine(), emptyLine()]);
  const [ledgerAccountId, setLedgerAccountId] = React.useState("");
  const [ledgerFrom, setLedgerFrom] = React.useState("");
  const [ledgerTo, setLedgerTo] = React.useState("");

  const [statementFrom, setStatementFrom] = React.useState("");
  const [statementTo, setStatementTo] = React.useState(todayLocal());
  let statements: { profit: ReturnType<typeof accountingStore.buildProfitAndLoss>; balance: ReturnType<typeof accountingStore.buildBalanceSheet> } | null = null;
  let statementError = "";
  if (tab === "statements") {
    try {
      statements = { profit: accountingStore.buildProfitAndLoss(statementFrom || undefined, statementTo || undefined), balance: accountingStore.buildBalanceSheet(statementTo || undefined) };
    } catch (error) { statementError = error instanceof Error ? error.message : String(error); }
  }

  void tick;
  const accounts = accountingStore.listAccounts(true);
  const journals = accountingStore.listJournalEntries();
  const trial = accountingStore.buildTrialBalance();
  const ledger = ledgerAccountId ? accountingStore.buildGeneralLedger(ledgerAccountId, ledgerFrom || undefined, ledgerTo || undefined) : [];
  const trialDebit = trial.reduce((sum, row) => sum + row.debit, 0);
  const trialCredit = trial.reduce((sum, row) => sum + row.credit, 0);

  function refresh() {
    setTick((value) => value + 1);
  }

  function createAccount() {
    try {
      const result = accountingStore.createAccount(accountForm);
      if (result.errors.length || !result.account) {
        setMessage({ type: "err", text: result.errors.join("; ") || "Unable to create account" });
        return;
      }
      setAccountForm({ code: "", name: "", type: "expense" });
      setMessage({ type: "ok", text: "Account " + result.account.code + " created." });
      refresh();
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  function postOpeningBank() {
    try {
      const amount = Number(openingBankAmount);
      const result = setOpeningBank(amount);
      if (!result.ok) {
        setMessage({ type: "err", text: result.error || "Unable to post opening bank balance" });
        return;
      }
      setOpeningBankAmount("");
      setMessage({ type: "ok", text: "Opening bank balance posted." });
      refresh();
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  function updateJournalLine(index: number, patch: Partial<DraftJournalLine>) {
    setJournalLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  function saveJournal() {
    try {
      const result = accountingStore.createJournalEntry({
        entryDate: journalDate,
        description: journalDescription,
        lines: journalLines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          memo: line.memo || null,
        })),
      });
      if (result.errors.length || !result.journalEntry) {
        setMessage({ type: "err", text: result.errors.join("; ") || "Unable to create journal" });
        return;
      }
      setMessage({ type: "ok", text: result.journalEntry.journalNumber + " saved as draft." });
      setJournalDate(todayLocal());
      setJournalDescription("");
      setJournalLines([emptyLine(), emptyLine()]);
      refresh();
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  function runJournalAction(action: () => { errors?: string[]; error?: string; journalEntry?: unknown; reversal?: unknown }, success: string) {
    try {
      const result = action();
      const errors = result.errors || (result.error ? [result.error] : []);
      if (errors.length) {
        setMessage({ type: "err", text: errors.join("; ") });
        return;
      }
      setMessage({ type: "ok", text: success });
      refresh();
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    }
  }

  const tabButton = (id: typeof tab, label: string) => (
    <Button variant={tab === id ? "primary" : "outline"} onClick={() => setTab(id)}>{label}</Button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Accounting & General Ledger</h2>
        <p className="mt-1 text-sm text-slate-500">Double-entry chart of accounts, journals, trial balance and account ledgers. New sales, collections, returns, exchanges, posted supplier invoices, direct purchases, supplier payments and expenses post automatically; card, UPI, online and other payments use Payment Clearing until reconciled.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabButton("accounts", "Chart of Accounts")}
        {tabButton("journal", "Journal Entries")}
        {tabButton("trial", "Trial Balance")}
        {tabButton("ledger", "General Ledger")}
        {tabButton("statements", "Financial Statements")}
      </div>

      {message && (
        <div className={message.type === "ok"
          ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          : "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"}>
          {message.text}
        </div>
      )}

      {tab === "accounts" && (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create account</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <FormField label="Account code *"><input className={inputClass} value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} placeholder="6100" /></FormField>
              <FormField label="Account name *"><input className={inputClass} value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Advertising Expense" /></FormField>
              <FormField label="Account type">
                <select className={selectClass} value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value as AccountingAccountType })}>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </FormField>
              <Button className="w-full" onClick={createAccount}>Create Account</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Opening bank balance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">Post the bank balance that existed before Minarva Biz accounting began. This is a one-time source action and is blocked after Bank has normal ledger activity.</p>
              <FormField label="Opening bank balance">
                <input className={inputClass} type="number" min="0.01" step="0.01" value={openingBankAmount} onChange={(e) => setOpeningBankAmount(e.target.value)} placeholder="0.00" />
              </FormField>
              <Button className="w-full" onClick={postOpeningBank} disabled={!Number.isFinite(Number(openingBankAmount)) || Number(openingBankAmount) <= 0}>Post Opening Bank</Button>
            </CardContent>
          </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Chart of Accounts</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Normal balance</th><th className="px-4 py-2 text-left">Status</th></tr></thead>
                <tbody>
                  {accounts.map((account) => <tr key={account.id} className="border-t border-slate-100"><td className="px-4 py-2 font-mono">{account.code}</td><td className="px-4 py-2 font-medium">{account.name}{account.systemKey ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">system</span> : null}</td><td className="px-4 py-2 capitalize">{account.type}</td><td className="px-4 py-2 capitalize">{account.normalBalance}</td><td className="px-4 py-2">{account.isActive ? "Active" : "Inactive"}</td></tr>)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "journal" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New manual journal</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <FormField label="Entry date"><input className={inputClass} type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} /></FormField>
                <FormField label="Description *"><input className={inputClass} value={journalDescription} onChange={(e) => setJournalDescription(e.target.value)} placeholder="Opening balance / adjustment / correction" /></FormField>
              </div>
              <div className="space-y-2">
                {journalLines.map((line, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.5fr_.7fr_.7fr_1fr_auto]">
                    <select aria-label={"Journal account " + (index + 1)} className={selectClass} value={line.accountId} onChange={(e) => updateJournalLine(index, { accountId: e.target.value })}>
                      <option value="">Select account</option>
                      {accounts.filter((account) => account.isActive).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                    </select>
                    <input aria-label={"Journal debit " + (index + 1)} className={inputClass} type="number" min="0" step="0.01" placeholder="Debit" value={line.debit} onChange={(e) => updateJournalLine(index, { debit: e.target.value, credit: e.target.value ? "" : line.credit })} />
                    <input aria-label={"Journal credit " + (index + 1)} className={inputClass} type="number" min="0" step="0.01" placeholder="Credit" value={line.credit} onChange={(e) => updateJournalLine(index, { credit: e.target.value, debit: e.target.value ? "" : line.debit })} />
                    <input className={inputClass} placeholder="Memo" value={line.memo} onChange={(e) => updateJournalLine(index, { memo: e.target.value })} />
                    <Button variant="outline" onClick={() => setJournalLines((current) => current.filter((_, i) => i !== index))} disabled={journalLines.length <= 2}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={() => setJournalLines((current) => [...current, emptyLine()])}>+ Add Line</Button>
                <Button onClick={saveJournal}>Save Draft Journal</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Journal register</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!journals.length && <p className="py-6 text-center text-sm text-slate-400">No journal entries yet</p>}
              {journals.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{entry.journalNumber} · {entry.description}</div>
                    <div className="mt-1 text-xs text-slate-500">{entry.entryDate} · {entry.status} · {entry.lines.length} lines · Dr {formatMoney(entry.totalDebit)} · Cr {formatMoney(entry.totalCredit)}</div>
                  </div>
                  <div className="flex gap-2">
                    {entry.status === "draft" && <Button size="sm" onClick={() => runJournalAction(() => accountingStore.postJournalEntry(entry.id), entry.journalNumber + " posted.")}>Post</Button>}
                    {(entry.referenceType === "expense" || entry.referenceType?.startsWith("auto_")) && <span className="text-xs text-slate-500">Automatic source posting</span>}
                    {entry.status === "posted" && entry.referenceType !== "expense" && !entry.referenceType?.startsWith("auto_") && <Button size="sm" variant="outline" onClick={() => runJournalAction(() => accountingStore.voidJournalEntry(entry.id), entry.journalNumber + " voided with reversal.")}>Void / Reverse</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "trial" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Trial Balance</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
              <tbody>
                {!trial.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No posted journals</td></tr>}
                {trial.map((row) => <tr key={row.accountId} className="border-t border-slate-100"><td className="px-4 py-2 font-mono">{row.code}</td><td className="px-4 py-2 font-medium">{row.name}</td><td className="px-4 py-2 capitalize">{row.type}</td><td className="px-4 py-2 text-right">{row.debit ? formatMoney(row.debit) : "—"}</td><td className="px-4 py-2 text-right">{row.credit ? formatMoney(row.credit) : "—"}</td></tr>)}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold"><tr><td colSpan={3} className="px-4 py-3">Total</td><td className="px-4 py-3 text-right">{formatMoney(trialDebit)}</td><td className="px-4 py-3 text-right">{formatMoney(trialCredit)}</td></tr></tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "statements" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Based on posted journals, including dated reversals. New sales, collections, returns, exchanges, posted supplier invoices, direct purchases, supplier payments and expenses post automatically. Older documents need accounting entries. Purchase tax stays pending review; unclassified purchases require classification. Legacy / Unallocated Settlement Clearing requires reconciliation; opening stock and any pre-system bank balance must be entered before these statements are complete.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Profit and loss from"><input aria-label="Profit and loss from" className={inputClass} type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} /></FormField>
            <FormField label="Statement end / balance sheet as of"><input aria-label="Statement end date" className={inputClass} type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} /></FormField>
          </div>
          {statementError && <p role="alert" className="text-sm text-rose-700">{statementError}</p>}
          {statements && <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Profit &amp; Loss</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <StatementSection title="Income" rows={statements.profit.income} total={statements.profit.totalIncome} />
                <StatementSection title="Expenses" rows={statements.profit.expenses} total={statements.profit.totalExpenses} />
                <div className="flex justify-between rounded-xl bg-slate-100 p-3 font-semibold"><span>Net profit / (loss)</span><span data-testid="statement-net-profit">{formatMoney(statements.profit.netProfit)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Balance Sheet</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-500">Cumulative balances through {statementTo || "all dates"}; the profit and loss start date does not limit this report.</p>
                <StatementSection title="Assets" rows={statements.balance.assets} total={statements.balance.totalAssets} />
                <StatementSection title="Liabilities" rows={statements.balance.liabilities} total={statements.balance.totalLiabilities} />
                <StatementSection title="Recorded equity" rows={statements.balance.equity} total={statements.balance.recordedEquity} />
                <div className="flex justify-between text-sm"><span>Unclosed earnings / (loss)</span><span>{formatMoney(statements.balance.unclosedEarnings)}</span></div>
                <div className="flex justify-between text-sm font-semibold"><span>Total equity including earnings</span><span>{formatMoney(statements.balance.totalEquity)}</span></div>
                <div className="flex justify-between rounded-xl bg-slate-100 p-3 font-semibold"><span>Liabilities + equity</span><span>{formatMoney(statements.balance.liabilitiesAndEquity)}</span></div>
                <p role="status" data-testid="statement-balance-status" className={statements.balance.balanced ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{statements.balance.balanced ? "Balance sheet balanced" : "Balance sheet difference: " + formatMoney(statements.balance.difference)}</p>
              </CardContent>
            </Card>
          </div>}
        </div>
      )}

      {tab === "ledger" && (
        <Card>
          <CardHeader><CardTitle className="text-base">General Ledger</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Account">
                <select className={selectClass} value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
                </select>
              </FormField>
              <FormField label="From"><input className={inputClass} type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} /></FormField>
              <FormField label="To"><input className={inputClass} type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} /></FormField>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[820px] w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Journal</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                <tbody>
                  {!ledgerAccountId && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Select an account</td></tr>}
                  {ledgerAccountId && !ledger.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No posted ledger activity</td></tr>}
                  {ledger.map((row, index) => <tr key={row.journalEntryId + "-" + index} className="border-t border-slate-100"><td className="px-3 py-2">{row.entryDate}</td><td className="px-3 py-2 font-mono">{row.journalNumber}</td><td className="px-3 py-2">{row.description}</td><td className="px-3 py-2 text-right">{row.debit ? formatMoney(row.debit) : "—"}</td><td className="px-3 py-2 text-right">{row.credit ? formatMoney(row.credit) : "—"}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(row.runningBalance)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatementSection({ title, rows, total }: { title: string; rows: Array<{ accountId: string; code: string; name: string; amount: number }>; total: number }) {
  return <section className="space-y-2">
    <h3 className="font-semibold text-slate-800">{title}</h3>
    <table className="w-full text-sm">
      <caption className="sr-only">{title} account balances</caption>
      <thead className="sr-only"><tr><th>Account</th><th>Amount</th></tr></thead>
      <tbody>
        {!rows.length && <tr><td colSpan={2} className="py-2 text-slate-500">No posted activity</td></tr>}
        {rows.map((row) => <tr key={row.accountId} className="border-b border-slate-100"><td className="py-2 pr-3">{row.code} · {row.name}</td><td className="py-2 text-right tabular-nums">{formatMoney(row.amount)}</td></tr>)}
      </tbody>
      <tfoot><tr className="font-semibold"><td className="pt-2">Total {title.toLowerCase()}</td><td className="pt-2 text-right">{formatMoney(total)}</td></tr></tfoot>
    </table>
  </section>;
}
