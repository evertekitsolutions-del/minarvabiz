"use client";

import * as React from "react";
import {
  accountingStore, phase9Store, buildAccountBudgetVariance,
  type AccountBudgetVariance,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

/** Manual preview, no saved budget or journal mutation. */
export function AccountBudgetVariancePanel() {
  const [accountId, setAccountId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [preview, setPreview] = React.useState<AccountBudgetVariance|null>(null);
  const [error, setError] = React.useState<string|null>(null);
  const activeBranchId=phase9Store.getActiveBranch()?.id ?? null;
  const accounts=accountingStore.listAccounts(true)
    .filter(a=>!a.deletedAt && ["income","expense"].includes(a.type) &&
      (a.branchId==null || a.branchId===activeBranchId));

  function resetPreview(){setPreview(null);setError(null);}
  function compare(){
    resetPreview();
    try {
      setPreview(buildAccountBudgetVariance({
        accountId,periodFrom:from,periodTo:to,budgetAmount:budget,
      },accountingStore.listAccounts(true),accountingStore.listJournalEntries(),
      phase9Store.getActiveBranch()?.id ?? null));
    }catch(e){setError(e instanceof Error?e.message:"Unable to compare budget");}
  }
  function download(){
    if(!preview)return;
    setError(null);
    try{
      const url=URL.createObjectURL(new Blob(["\uFEFF",preview.csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");
      link.href=url;
      link.download="minarvabiz-budget-variance-"+preview.from+"-"+preview.to+".csv";
      document.body.appendChild(link);
      try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setError(e instanceof Error?e.message:"Budget CSV export failed");}
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs Actual (posted ledger)</CardTitle>
        <p className="text-xs text-slate-600">
          Compare one expense or revenue account against an entered period budget.
          Includes posted journals and reversal pairs by transaction date.
          This report is a one-time preview: budgets are not stored and no ledger
          posting, allocation or approval takes place.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Income or expense account">
            <select aria-label="Budget account" className={selectClass} value={accountId}
              onChange={e=>{setAccountId(e.target.value);resetPreview();}}>
              <option value="">Select account</option>
              {accounts.map(account=>(
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name} ({account.type})
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Period from">
            <input aria-label="Budget period from" type="date" className={inputClass}
              value={from} onChange={e=>{setFrom(e.target.value);resetPreview();}} />
          </FormField>
          <FormField label="Period to">
            <input aria-label="Budget period to" type="date" className={inputClass}
              value={to} onChange={e=>{setTo(e.target.value);resetPreview();}} />
          </FormField>
          <FormField label="Budget amount">
            <input aria-label="Budget amount" type="text" inputMode="decimal"
              className={inputClass} placeholder="10000.00" value={budget}
              onChange={e=>{setBudget(e.target.value);resetPreview();}} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={compare}>Compare budget</Button>
          {preview && <Button size="sm" variant="outline" onClick={download}>Export budget variance CSV</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {preview && (
          <div className="space-y-3">
            <p role="status" className="text-sm font-medium text-slate-800">
              {preview.accountCode} · {preview.accountName} · {preview.matchedJournalCount} posted journal(s)
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Budget
                <p className="text-lg font-semibold">{formatMoney(preview.budget)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Actual
                <p className="text-lg font-semibold">{formatMoney(preview.actual)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Variance (actual - budget)
                <p className="text-lg font-semibold">{formatMoney(preview.variance)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">Budget utilization
                <p className="text-lg font-semibold">
                  {preview.utilizationPercent==null?"Not comparable":preview.utilizationPercent+"%"}
                </p>
              </div>
            </div>
            <p className={"text-sm font-medium "+(preview.favorable?"text-emerald-700":"text-rose-700")}>
              {preview.favorable?"Favorable":"Unfavorable"} variance for a {preview.type} account
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
