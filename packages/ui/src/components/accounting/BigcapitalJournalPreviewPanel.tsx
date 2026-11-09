"use client";
import * as React from 'react';
import type { JournalEntry, AccountingAccount } from '@minarvabiz/types';
import { assertPermission, buildBigcapitalJournalPreview, parseBigcapitalCatalog, phase9Store, getShopProfile } from '@minarvabiz/business-logic';
import type { BigcapitalAccountCatalog } from '@minarvabiz/business-logic';
import { Button } from '../Button';
import { FormField, inputClass, selectClass } from '../forms/FormField';

/** Opt-in local review only; credentials never enter the renderer and no POST is available. */
export function BigcapitalJournalPreviewPanel({journals,accounts}:{journals:JournalEntry[];accounts:AccountingAccount[]}) {
  const [enabled,setEnabled]=React.useState(false);
  const [catalog,setCatalog]=React.useState<BigcapitalAccountCatalog|null>(null);
  const [mapping,setMapping]=React.useState<Record<string,number>>({});
  const [workspace,setWorkspace]=React.useState('');
  const [targetBranch,setTargetBranch]=React.useState('');
  const [from,setFrom]=React.useState('');const [through,setThrough]=React.useState('');
  const [message,setMessage]=React.useState('');
  const branch=phase9Store.getActiveBranch();
  React.useEffect(()=>{setMapping({});setCatalog(null);setMessage('');setEnabled(false);},[branch?.id]);
  async function load(file?:File) {
    if(!file)return;
    const selectedBranch=phase9Store.getActiveBranch()?.id;
    try {
      assertPermission('accounting.view');
      if(file.size>2_000_000)throw Error('Account catalog exceeds 2 MB');
      const parsed=parseBigcapitalCatalog(JSON.parse(await file.text()));
      assertPermission('accounting.view');
      if(phase9Store.getActiveBranch()?.id!==selectedBranch)throw Error('Branch changed; load the catalog again');
      setCatalog(parsed);setMapping({});setMessage('Account catalog loaded. Verify target organization and map accounts.');
    } catch(e) {setCatalog(null);setMapping({});setMessage(e instanceof Error?e.message:'Catalog load failed');}
  }
  function download() {
    try {
      assertPermission('accounting.view');
      const active=phase9Store.getActiveBranch(),hq=phase9Store.listBranches().find(b=>b.isHeadquarters);
      if(!catalog||!active||!hq)throw Error('Load target account catalog and select a branch');
      const result=buildBigcapitalJournalPreview(journals,{enabled,sourceWorkspace:workspace,branchId:active.id,headquartersBranchId:hq.id,
        targetBranchId:Number(targetBranch),currency:getShopProfile().currency,from,through,catalog,accountMap:mapping});
      const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`minarva-bigcapital-review-${from}-${through}.json`;document.body.appendChild(anchor);
      try {anchor.click();setMessage(`${result.journalCount} journals exported for review. Nothing was sent to Bigcapital.`);}
      finally {anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    } catch(e) {setMessage(e instanceof Error?e.message:'Preview failed');}
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setMessage('');}}/>Enable Bigcapital journal review</label>
    {enabled&&<>
      <p className="mt-2 text-xs text-slate-600">Prepare draft journal payloads for the active branch. This does not connect or post to Bigcapital. Use the read-only account catalog command in the integration guide; never upload API keys here.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label="Stable source workspace ID"><input className={inputClass} value={workspace} maxLength={64} onChange={e=>setWorkspace(e.target.value)}/></FormField>
        <FormField label="Target Bigcapital branch ID"><input className={inputClass} type="number" min="1" step="1" value={targetBranch} onChange={e=>setTargetBranch(e.target.value)}/></FormField>
        <FormField label="From"><input className={inputClass} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></FormField>
        <FormField label="Through"><input className={inputClass} type="date" value={through} onChange={e=>setThrough(e.target.value)}/></FormField>
        <FormField label="Bigcapital account catalog JSON"><input type="file" accept="application/json,.json" onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/></FormField>
      </div>
      {catalog&&<><p className="mt-3 text-xs">Target: {catalog.origin} · Organization: {catalog.organizationId} · Source: {branch?.name} · {getShopProfile().currency}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.map(a=><FormField key={a.id} label={`${a.code} — ${a.name}`}><select className={selectClass} value={mapping[a.id]??''} onChange={e=>setMapping(old=>({...old,[a.id]:Number(e.target.value)}))}><option value="">Choose target account</option>{catalog.accounts.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.code} — {t.name} (#{t.id})</option>)}</select></FormField>)}</div></>}
      <Button type="button" size="sm" variant="outline" className="mt-3" disabled={!catalog||!workspace||!targetBranch||!from||!through} onClick={download}>Download journal review JSON</Button>
      <p className="mt-2 text-xs text-slate-500">Target base currency must match. Original voided journals and their dated reversals remain in ledger history. JSON is an adapter review file, not a Bigcapital UI import format.</p>
    </>}
    {message&&<p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}
