"use client";

import * as React from "react";
import { configFromEnv, pgRpc, pgSelect } from "@minarvabiz/database";
import { getRuntimeMode, getSessionToken, getSessionUser, qrMatrix } from "@minarvabiz/business-logic";
import { resolveOnlineAuthorization } from "../../../lib/data-source";

type Rate = { id: string; org_id: string; branch_id: string; service_code: string;
  garment: string; fabric: string; customer_rate: number; tat_hours: number };
type Job = { id: string; org_id: string; branch_id: string; rate_card_id: string;
  tag_code: string; customer_name: string; garment_name: string; quantity: number;
  stage: string; version: number; due_at: string };
type Pending = { id: string; tag: string; rateId: string; customer: string;
  garment: string; quantity: number; notes: string };
const nextStage: Record<string,string> = {
  intake:"tagged", tagged:"washing", washing:"ironing",
  ironing:"qc", qc:"ready", ready:"delivered",
};

async function context() {
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Supabase sign-in required.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);
  return { cfg:{...cfg,accessToken:token}, token, userId:user.id, orgId:auth.orgId };
}
function hasUnchangedSession(token:string,userId:string) {
  return token===getSessionToken() && userId===getSessionUser()?.id;
}

function GarmentQr({tag}:{tag:string}) {
  const matrix=React.useMemo(()=>qrMatrix(tag),[tag]);
  const quiet=4;
  return <svg className="h-28 w-28" viewBox={`0 0 ${matrix.length+quiet*2} ${matrix.length+quiet*2}`}
    role="img" aria-label={`Garment tag QR ${tag}`} xmlns="http://www.w3.org/2000/svg">
    <rect width={matrix.length+quiet*2} height={matrix.length+quiet*2} fill="white"/>
    {matrix.flatMap((row,y)=>row.flatMap((dark,x)=> dark?
      [<rect key={y+"-"+x} x={x+quiet} y={y+quiet} width="1" height="1" fill="black"/>]:[]))}
  </svg>;
}

export function SaasGarmentWorkflow() {
  const [rates,setRates]=React.useState<Rate[]>([]);
  const [jobs,setJobs]=React.useState<Job[]>([]);
  const [rateId,setRateId]=React.useState("");
  const [customer,setCustomer]=React.useState("");
  const [garment,setGarment]=React.useState("");
  const [quantity,setQuantity]=React.useState("1");
  const [notes,setNotes]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [status,setStatus]=React.useState("");
  const [error,setError]=React.useState("");
  const pending=React.useRef<Pending|null>(null);
  const inFlight=React.useRef(false);

  const load=React.useCallback(async()=>{
    const ctx=await context();
    const [r,j]=await Promise.all([
      pgSelect<Rate>(ctx.cfg,"laundry_service_rate_cards",
        "select=id,org_id,branch_id,service_code,garment,fabric,customer_rate,tat_hours"
        +"&org_id=eq."+ctx.orgId+"&deleted_at=is.null&order=service_code.asc&limit=1000"),
      pgSelect<Job>(ctx.cfg,"saas_laundry_garment_jobs",
        "select=*&org_id=eq."+ctx.orgId+"&order=created_at.desc&limit=300"),
    ]);
    if(r.error || j.error || !r.data || !j.data) {
      throw new Error(r.error?.message||j.error?.message||"Cloud garment data was not confirmed.");
    }
    if(!hasUnchangedSession(ctx.token,ctx.userId)) throw new Error("Account changed during cloud refresh.");
    setRates(r.data);setJobs(j.data);
    setRateId(prev=>r.data?.some(rate=>rate.id===prev)?prev:(r.data?.[0]?.id||""));
  },[]);
  React.useEffect(()=>{
    if(getRuntimeMode()==="demo")return;
    let active=true;
    const refresh=()=>{if(getSessionToken())void load().catch(e=>{if(active)setError(String(e.message||e))});};
    refresh();
    window.addEventListener("minarva:data-hydrated",refresh);
    return()=>{active=false;window.removeEventListener("minarva:data-hydrated",refresh)};
  },[load]);

  async function intake(){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");setStatus("");
    try{
      const count=Number(quantity);
      if(!pending.current){
        if(!rateId||!customer.trim()||!garment.trim()||
            !Number.isSafeInteger(count)||count<1||count>10000)
          throw new Error("Choose a rate and enter valid customer, garment and quantity.");
        const id=crypto.randomUUID();
        pending.current={id,tag:"MB-"+id.replaceAll("-","").slice(0,14).toUpperCase(),
          rateId,customer:customer.trim(),garment:garment.trim(),quantity:count,notes:notes.trim()};
      }
      const p=pending.current;
      if(!p)throw new Error("No pending cloud transaction.");
      const ctx=await context();
      const result=await pgRpc<Record<string,unknown>>(ctx.cfg,"saas_laundry_intake",{
        p_job_id:p.id,p_rate_card_id:p.rateId,p_customer_name:p.customer,
        p_garment_name:p.garment,p_tag_code:p.tag,p_quantity:p.quantity,p_notes:p.notes||null,
      });
      if(result.error)throw new Error(result.error.message);
      const check=await pgSelect<Job>(ctx.cfg,"saas_laundry_garment_jobs",
        "select=*&id=eq."+p.id+"&org_id=eq."+ctx.orgId+"&limit=2");
      if(check.error||check.data?.length!==1||check.data[0].tag_code!==p.tag||
         check.data[0].stage!=="intake")throw new Error("Intake NOT confirmed in Supabase. Retry same tag.");
      if(!hasUnchangedSession(ctx.token,ctx.userId))throw new Error("Session changed after cloud commit.");
      pending.current=null;
      setStatus("Garment "+p.tag+" confirmed in Supabase. Print the QR tag.");
      setCustomer("");setGarment("");setQuantity("1");setNotes("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Garment NOT saved to Supabase.");}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function advance(job:Job){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");setStatus("");
    try{
      const next=nextStage[job.stage];
      if(!next)throw new Error("Garment already delivered.");
      const ctx=await context();
      const result=await pgRpc<Record<string,unknown>>(ctx.cfg,"saas_laundry_step",{
        p_job_id:job.id,p_expected_version:job.version,p_next_stage:next,
      });
      if(result.error)throw new Error(result.error.message);
      const check=await pgSelect<Job>(ctx.cfg,"saas_laundry_garment_jobs",
        "select=*&id=eq."+job.id+"&org_id=eq."+ctx.orgId+"&limit=2");
      if(check.error||check.data?.length!==1||check.data[0].stage!==next||
         Number(check.data[0].version)!==job.version+1)
         throw new Error("Stage transition NOT confirmed in Supabase.");
      if(!hasUnchangedSession(ctx.token,ctx.userId))throw new Error("Account changed after stage transition.");
      setStatus(job.tag_code+" → "+next+" confirmed in Supabase.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Stage NOT confirmed.");}
    finally{inFlight.current=false;setBusy(false);}
  }

  if(getRuntimeMode()==="demo")return null;
  return <section className="space-y-3 rounded-lg border bg-white p-4">
    <h3 className="text-lg font-semibold">Cloud garment intake & QR tracking</h3>
    <p className="text-xs text-slate-600">Intake → Tag → Wash → Iron → QC → Ready → Delivery. Each step requires a durable Supabase receipt.</p>
    <div className="grid gap-2 sm:grid-cols-5">
      <label className="text-sm">Service rate
        <select className="mt-1 w-full rounded border p-2" value={rateId} disabled={busy||!!pending.current}
          onChange={e=>setRateId(e.target.value)}>
          {rates.map(r=><option key={r.id} value={r.id}>{r.service_code} · {r.garment} · ₹{r.customer_rate}</option>)}
        </select>
      </label>
      <label className="text-sm">Customer
        <input className="mt-1 w-full rounded border p-2" value={customer} disabled={busy||!!pending.current}
          onChange={e=>setCustomer(e.target.value)}/>
      </label>
      <label className="text-sm">Garment
        <input className="mt-1 w-full rounded border p-2" value={garment} disabled={busy||!!pending.current}
          onChange={e=>setGarment(e.target.value)}/>
      </label>
      <label className="text-sm">Qty
        <input className="mt-1 w-full rounded border p-2" type="number" min="1" step="1" value={quantity}
          disabled={busy||!!pending.current} onChange={e=>setQuantity(e.target.value)}/>
      </label>
      <button type="button" className="self-end rounded bg-slate-900 p-2 text-white disabled:opacity-50"
        disabled={busy||rates.length===0} onClick={()=>{void intake()}}>
        {busy?"Saving…":pending.current?"Retry same intake":"Create cloud garment tag"}
      </button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {status&&<p role="status" className="text-sm text-green-700">{status}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {jobs.map(job=><article key={job.id} className="flex gap-3 rounded border p-2">
        <div className="saas-garment-tag shrink-0"><GarmentQr tag={job.tag_code}/><div className="text-center text-xs">{job.tag_code}</div></div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{job.customer_name}</p>
          <p className="break-words">{job.garment_name} × {job.quantity}</p>
          <p>Status: <strong>{job.stage}</strong> · v{job.version}</p>
          <p className="text-xs text-slate-500">Due {new Date(job.due_at).toLocaleString()}</p>
          {nextStage[job.stage]&&<button type="button" className="mt-2 rounded border px-2 py-1 disabled:opacity-50"
            disabled={busy} onClick={()=>{void advance(job)}}>
              Advance → {nextStage[job.stage]}
            </button>}
        </div>
      </article>)}
    </div>
  </section>;
}
