"use client";
import * as React from "react";
import type { JournalEntry } from "@minarvabiz/types";
import {
  assertPermission, buildTallyPrimeVoucherImportXml, phase9Store,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { FormField, inputClass } from "../forms/FormField";

function todayLocal(): string {
  const today = new Date();
  return new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

/** Deliberately file-only. No implicit Tally server connection or voucher posting. */
export function TallyPrimeExportPanel({ journals }: { journals: JournalEntry[] }) {
  const [companyName, setCompanyName] = React.useState("");
  const [from, setFrom] = React.useState(()=>todayLocal().slice(0,7)+"-01");
  const [through, setThrough] = React.useState(todayLocal);
  const [feedback, setFeedback] = React.useState<{error:boolean;text:string}|null>(null);
  const postedCount = journals.filter(entry=>entry.status==="posted"&&!entry.voidedAt
    && entry.entryDate>=from&&entry.entryDate<=through).length;

  function exportXml() {
    try {
      assertPermission("accounting.view");
      const selected = phase9Store.getActiveBranch();
      const hq = phase9Store.listBranches().find(branch=>branch.isHeadquarters);
      if (!selected || !hq) throw new Error("Active branch and headquarters must be configured");
      const result = buildTallyPrimeVoucherImportXml(journals,{
        companyName,from,through,branchId:selected.id,headquartersBranchId:hq.id,
      });
      const objectUrl = URL.createObjectURL(new Blob([result.xml],{type:"application/xml;charset=utf-8"}));
      const anchor = document.createElement("a");
      anchor.href=objectUrl;
      anchor.download="minarvabiz-tallyprime-"+from+"-to-"+through+".xml";
      document.body.appendChild(anchor);
      try {
        anchor.click();
        setFeedback({error:false,text:result.voucherCount+" posted journal(s) prepared for manual TallyPrime import. Check Tally's import summary for accepted vouchers."});
      } finally {
        anchor.remove();
        window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
      }
    } catch (error) {
      setFeedback({error:true,text:error instanceof Error?error.message:"Tally XML export failed"});
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h3 className="text-sm font-semibold">TallyPrime Journal XML export</h3>
    <p className="mt-1 text-xs text-slate-600">
      File-only integration · posted double-entry journals in the active branch · not tax invoices.
      Tally company and ledger master names must match. Review import preview and duplicate voucher numbers before importing.
    </p>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <FormField label="Exact Tally company name *">
        <input className={inputClass} maxLength={160} value={companyName}
          onChange={e=>setCompanyName(e.target.value)} placeholder="Company as shown in TallyPrime"/>
      </FormField>
      <FormField label="From">
        <input className={inputClass} type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
      </FormField>
      <FormField label="Through">
        <input className={inputClass} type="date" value={through} onChange={e=>setThrough(e.target.value)}/>
      </FormField>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={!companyName.trim()||!postedCount} onClick={exportXml}>
        Export TallyPrime XML
      </Button>
      <span className="text-xs text-slate-600">{postedCount} posted journal(s) in date range before branch filtering</span>
    </div>
    {feedback && <p role={feedback.error?"alert":"status"} className={"mt-2 text-xs "+(feedback.error?"text-rose-700":"text-slate-600")}>{feedback.text}</p>}
    <p className="mt-2 text-xs text-slate-500">
      In TallyPrime: Alt+O → Import → Transactions, select XML; check accepted, rejected and duplicate vouchers.
      Export creates no Tally ledger masters, GST sales invoices or sync connection.
    </p>
  </section>;
}
