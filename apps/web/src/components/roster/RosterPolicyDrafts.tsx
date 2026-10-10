'use client';
import * as React from 'react';
import { onlineRosterPolicies } from '@/lib/roster-policy-online';
import { validatePolicyDraft, type PolicyDraft, type PolicyDraftInput } from '@/lib/roster-policy-client';

const blank=():PolicyDraftInput=>({branchId:'',effectiveFrom:'',effectiveUntil:null,ianaZone:'',foldPolicy:'reject',minimumRestMinutes:0,expectedVersion:0});
export function RosterPolicyDrafts({branches}:{branches:ReadonlyArray<{id:string;name:string}>}) {
  const [rows,setRows]=React.useState<PolicyDraft[]>([]);
  const [form,setForm]=React.useState(blank);
  const [busy,setBusy]=React.useState(false);
  const [loaded,setLoaded]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const [error,setError]=React.useState('');
  const [conflict,setConflict]=React.useState<PolicyDraft|null>(null);
  const alive=React.useRef(true), flight=React.useRef(false);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  function edit(row:PolicyDraft) {
    setForm({branchId:row.branch_id,effectiveFrom:row.effective_from,effectiveUntil:row.effective_until,
      ianaZone:row.iana_zone,foldPolicy:row.dst_fold_policy,minimumRestMinutes:row.minimum_rest_minutes,expectedVersion:row.version});
    setConflict(null);setMessage('Review the loaded draft before saving.');setError('');
  }
  async function load() {
    if(flight.current)return;flight.current=true;setBusy(true);setError('');setMessage('');
    setRows([]);setLoaded(false);setConflict(null);setForm(blank());
    try {const records=await onlineRosterPolicies().list();if(alive.current){setRows(records);setLoaded(true)}}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}
    finally{flight.current=false;if(alive.current)setBusy(false)}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(flight.current||!loaded)return;
    try { validatePolicyDraft(form); } catch(e) {setError(e instanceof Error?e.message:String(e));return;}
    flight.current=true;setBusy(true);setError('');setMessage('');setConflict(null);
    try {
      const result=await onlineRosterPolicies().save(form);
      if(!alive.current)return;
      if(!result.accepted){
        setLoaded(false);setConflict(result.remote);
        setError('The saved revision changed. Your input was not overwritten. Review the current Cloud draft or reload before another save.');
      } else {
        setRows(previous=>[result.record,...previous.filter(row=>row.id!==result.record.id)]);
        setForm({...form,expectedVersion:result.record.version});
        setMessage('Draft saved. These rules are not approved or enforced on rosters.');
      }
    } catch(e){if(alive.current){setLoaded(false);setError(e instanceof Error?e.message:String(e))}}
    finally{flight.current=false;if(alive.current)setBusy(false)}
  }
  const inputClass='rounded border bg-transparent p-2';
  return <section aria-label="Branch timezone and rest policy drafts" className="rounded border p-4 space-y-3">
    <h2 className="font-semibold">Branch timezone and rest policy drafts</h2>
    <p>Draft — not enforced. Prepare branch rules for review. Saving does not approve a policy or change existing shifts.</p>
    <button type="button" className={inputClass} disabled={busy} onClick={()=>void load()}>Load / reload policy drafts</button>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {conflict&&<div className="rounded border p-3">
      <p>Current Cloud draft: revision {conflict.version}; {conflict.iana_zone}; repeated time: {conflict.dst_fold_policy}; rest: {conflict.minimum_rest_minutes} minutes; through {conflict.effective_until||'no end date'}.</p>
      <button type="button" disabled={busy} onClick={()=>{edit(conflict);setLoaded(true)}} className={inputClass}>Load Cloud draft for review</button>
    </div>}
    <form onSubmit={event=>void save(event)}>
      <fieldset disabled={busy||!loaded} className="grid gap-3 md:grid-cols-2">
        <legend className="font-medium">{form.expectedVersion?'Edit draft revision '+form.expectedVersion:'New policy draft'}</legend>
        <label className="grid gap-1">Branch<select required className={inputClass} value={form.branchId} disabled={form.expectedVersion>0} onChange={e=>setForm({...form,branchId:e.target.value})}>
          <option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
        <label className="grid gap-1">Effective from<input type="date" required min="1900-01-01" max="9999-12-31" className={inputClass} value={form.effectiveFrom} disabled={form.expectedVersion>0} onChange={e=>setForm({...form,effectiveFrom:e.target.value})}/></label>
        <label className="grid gap-1">Effective until (optional)<input type="date" min={form.effectiveFrom||'1900-01-01'} max="9999-12-31" className={inputClass} value={form.effectiveUntil||''} onChange={e=>setForm({...form,effectiveUntil:e.target.value||null})}/></label>
        <label className="grid gap-1">IANA timezone<input required placeholder="Asia/Kolkata" maxLength={128} className={inputClass} value={form.ianaZone} onChange={e=>setForm({...form,ianaZone:e.target.value})}/></label>
        <label className="grid gap-1">Repeated clock time (DST)<select className={inputClass} value={form.foldPolicy} onChange={e=>setForm({...form,foldPolicy:e.target.value as PolicyDraftInput['foldPolicy']})}>
          <option value="reject">Reject ambiguous time</option><option value="earlier">Use earlier occurrence</option><option value="later">Use later occurrence</option>
        </select></label>
        <label className="grid gap-1">Minimum rest (minutes)<input type="number" required min={0} max={10080} step={1} className={inputClass} value={Number.isNaN(form.minimumRestMinutes)?'':form.minimumRestMinutes} onChange={e=>setForm({...form,minimumRestMinutes:e.target.value===''?NaN:Number(e.target.value)})}/></label>
        <p>Nonexistent clock times during a DST change are always rejected by the proposed policy.</p>
        <div className="flex gap-2"><button type="submit" className={inputClass}>Save draft only</button><button type="button" className={inputClass} onClick={()=>{setForm(blank());setMessage('');setConflict(null)}}>New draft</button></div>
      </fieldset>
    </form>
    {loaded&&rows.length===0&&<p>No saved policy drafts are visible for this organization.</p>}
    {rows.length>0&&<ul className="space-y-2">{rows.map(row=><li key={row.id}>
      {branches.find(b=>b.id===row.branch_id)?.name||'Unavailable branch'} · {row.effective_from} · {row.iana_zone} · rest {row.minimum_rest_minutes} min · draft v{row.version}
      <button type="button" disabled={busy||!loaded||!branches.some(b=>b.id===row.branch_id)} className="ml-2 rounded border px-2" onClick={()=>edit(row)}>Review / edit draft</button>
    </li>)}</ul>}
  </section>;
}
