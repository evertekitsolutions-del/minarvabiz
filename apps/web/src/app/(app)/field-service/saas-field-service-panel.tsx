"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getSessionToken,getSessionUser,getOutboxScope} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Branch={id:string;name:string};
type Customer={id:string;name:string};
type Visit={id:string;site_name:string;service_kind:string;scheduled_at:string;status:string;customer_id:string;branch_id:string};
type Evidence={id:string;visit_id:string;event_type:string;created_at:string};
type Agreement={id:string;customer_id:string;ends_on:string;annual_value:number};
type PendingCall={id:string;payload:string};
const inputClass="min-h-[44px] w-full rounded border p-2 text-sm";
const btnClass="min-h-[44px] touch-manipulation rounded bg-slate-900 px-4 text-sm text-white disabled:opacity-50";
function today(){return new Date().toISOString().slice(0,10)}
export function SaasFieldServicePanel(){
 const [branches,setBranches]=React.useState<Branch[]>([]);
 const [customers,setCustomers]=React.useState<Customer[]>([]);
 const [visits,setVisits]=React.useState<Visit[]>([]);
 const [events,setEvents]=React.useState<Evidence[]>([]);
 const [agreements,setAgreements]=React.useState<Agreement[]>([]);
 const [branchId,setBranchId]=React.useState("");
 const [customerId,setCustomerId]=React.useState("");
 const [site,setSite]=React.useState("");
 const [kind,setKind]=React.useState("inspection");
 const [scheduled,setScheduled]=React.useState(today()+"T10:00");
 const [visitId,setVisitId]=React.useState("");
 const [check,setCheck]=React.useState("Safety checklist");
 const [passed,setPassed]=React.useState(true);
 const [url,setUrl]=React.useState("");
 const [evidenceKind,setEvidenceKind]=React.useState<"photo"|"pdf">("photo");
 const [signedBy,setSignedBy]=React.useState("");
 const [consent,setConsent]=React.useState(false);
 const [start,setStart]=React.useState(today());
 const [end,setEnd]=React.useState("");
 const [amount,setAmount]=React.useState("0");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const pending=React.useRef<Record<string,PendingCall>>({});
 const inFlight=React.useRef(false);
 const canvas=React.useRef<HTMLCanvasElement>(null);
 const drawing=React.useRef(false);
 const strokes=React.useRef(0);
 async function context(){
  const c=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!c||!token||!user?.id)throw new Error("Cloud sign-in required.");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok||getOutboxScope()!==a.orgId+":"+user.id||!can("orders.manage"))
   throw new Error("Field service manager permission required.");
  return {cfg:{...c,accessToken:token},token,user:user.id,org:a.orgId};
 }
 function guard(t:string,u:string){
  if(t!==getSessionToken()||u!==getSessionUser()?.id)throw new Error("Session changed; confirm transaction again.");
 }
 const refresh=React.useCallback(async()=>{
  const a=await context();
  const [b,c,v,e,m]=await Promise.all([
   pgSelect<Branch>(a.cfg,"branches","select=id,name&org_id=eq."+a.org+"&is_active=eq.true&deleted_at=is.null&limit=100"),
   pgSelect<Customer>(a.cfg,"customers","select=id,name&org_id=eq."+a.org+"&deleted_at=is.null&limit=500"),
   pgSelect<Visit>(a.cfg,"saas_field_visits","select=id,site_name,service_kind,scheduled_at,status,customer_id,branch_id&org_id=eq."+a.org+"&order=created_at.desc&limit=250"),
   pgSelect<Evidence>(a.cfg,"saas_field_visit_events","select=id,visit_id,event_type,created_at&org_id=eq."+a.org+"&order=created_at.desc&limit=1000"),
   pgSelect<Agreement>(a.cfg,"saas_amc_agreements","select=id,customer_id,ends_on,annual_value&org_id=eq."+a.org+"&order=created_at.desc&limit=200"),
  ]);
  if(b.error||c.error||v.error||e.error||m.error||!b.data||!c.data||!v.data||!e.data||!m.data)
   throw new Error(b.error?.message||c.error?.message||v.error?.message||e.error?.message||m.error?.message||"Cloud field service unavailable.");
  guard(a.token,a.user);
  setBranches(b.data);setCustomers(c.data);setVisits(v.data);setEvents(e.data);setAgreements(m.data);
  setBranchId(x=>b.data?.some(t=>t.id===x)?x:b.data?.[0]?.id||"");
  setCustomerId(x=>c.data?.some(t=>t.id===x)?x:c.data?.[0]?.id||"");
  setVisitId(x=>v.data?.some(t=>t.id===x&&t.status==="scheduled")?x:v.data?.find(t=>t.status==="scheduled")?.id||"");
 },[]);
 React.useEffect(()=>{let active=true;void refresh().catch(e=>{if(active)setError(String(e?.message||e))});return()=>{active=false};},[refresh]);
 const act=async(key:string,rpc:string,args:Record<string,unknown>,verify:(a:Awaited<ReturnType<typeof context>>,id:string)=>Promise<boolean>)=>{
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const fingerprint=JSON.stringify({rpc,args});
   pending.current[key]??={id:crypto.randomUUID(),payload:fingerprint};
   const item=pending.current[key];
   if(item.payload!==fingerprint)throw new Error("Operation details changed while retry is pending; refresh before a new request.");
   const a=await context();
   const r=await pgRpc<{event_id?:string;visit_id?:string;agreement_id?:string;idempotent:boolean}>(
    a.cfg,rpc,{...args,...(rpc==="saas_field_visit_create_once"?{p_visit_id:item.id}:
    rpc==="saas_amc_create_once"?{p_agreement_id:item.id}:{p_event_id:item.id})});
   if(r.error||!r.data)throw new Error(r.error?.message||"Cloud operation not acknowledged; retry same ID.");
   if(!await verify(a,item.id))throw new Error("Durable cloud readback unavailable; retry same ID.");
   guard(a.token,a.user);
   delete pending.current[key];
   await refresh();
   setNotice("Cloud record confirmed in Supabase. "+rpc.replaceAll("_"," "));
  }catch(e){setError(e instanceof Error?e.message:"Field service RPC not confirmed.");}
  finally{inFlight.current=false;setBusy(false);}
 };
 const verify=(table:string)=>async(a:Awaited<ReturnType<typeof context>>,id:string)=>{
  const r=await pgSelect<{id:string}>(a.cfg,table,
   "select=id&id=eq."+id+"&org_id=eq."+a.org+"&limit=2");
  return !r.error&&r.data?.length===1;
 };
 const createVisit=()=>{void act("visit","saas_field_visit_create_once",{
  p_branch_id:branchId,p_customer_id:customerId,
  p_site_name:site.trim(),p_service_kind:kind,
  p_scheduled_at:new Date(scheduled).toISOString(),
 },verify("saas_field_visits"))};
 const append=(type:"checklist"|"evidence"|"handover",payload:Record<string,unknown>)=>{
  if(!visitId){setError("Select an active visit.");return;}
  void act(type+":"+visitId,"saas_field_visit_event_once",{
   p_visit_id:visitId,p_event_type:type,p_payload:payload,
  },verify("saas_field_visit_events"));
 };
 const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{
  const el=canvas.current;if(!el)return {x:0,y:0};
  const b=el.getBoundingClientRect();
  return {x:(e.clientX-b.left)*el.width/b.width,y:(e.clientY-b.top)*el.height/b.height};
 };
 const startStroke=(e:React.PointerEvent<HTMLCanvasElement>)=>{
  const el=canvas.current;if(!el)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  const c=el.getContext("2d");if(!c)return;
  const p=point(e);drawing.current=true;c.lineWidth=2.5;c.strokeStyle="#0f172a";
  c.lineCap="round";c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+0.1,p.y+0.1);c.stroke();strokes.current++;
 };
 const moveStroke=(e:React.PointerEvent<HTMLCanvasElement>)=>{
  if(!drawing.current)return;
  const c=canvas.current?.getContext("2d");if(!c)return;
  const p=point(e);c.lineTo(p.x,p.y);c.stroke();
 };
 const endStroke=()=>{drawing.current=false};
 const handover=()=>{
  if(!consent||!signedBy.trim()||!strokes.current||!canvas.current){
   setError("Customer consent, signed name and drawn signature are required.");return;
  }
  const png=canvas.current.toDataURL("image/png");
  if(png.length>32000){setError("Signature too large. Clear and redraw more simply.");return;}
  append("handover",{signed_name:signedBy.trim(),consent,signature_png:png});
 };
 const newAmc=()=>{
  const v=Number(amount);
  if(!Number.isFinite(v)||v<0||!start||!end){setError("Valid AMC dates and amount required.");return;}
  void act("amc","saas_amc_create_once",{
   p_branch_id:branchId,p_customer_id:customerId,p_visit_id:visitId||null,
   p_start:start,p_end:end,p_annual_value:v,
  },verify("saas_amc_agreements"));
 };
 const activeVisit=visits.find(v=>v.id===visitId);
 return <main className="space-y-4 rounded-xl border bg-white p-4">
  <h1 className="text-xl font-semibold">Cloud Field Service & AMC</h1>
  <p className="text-xs text-slate-600">Tenant-scoped visits, inspection evidence, image signature and service contracts. Photos/PDFs are HTTPS references, not hosted uploads.</p>
  <div className="grid gap-2 sm:grid-cols-3">
   <label className="text-sm">Branch<select className={inputClass} disabled={busy} value={branchId} onChange={e=>setBranchId(e.target.value)}>
    {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label className="text-sm">Customer<select className={inputClass} disabled={busy} value={customerId} onChange={e=>setCustomerId(e.target.value)}>
    {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label className="text-sm">Service kind<select className={inputClass} disabled={busy} value={kind} onChange={e=>setKind(e.target.value)}>
    {["inspection","installation","repair","amc"].map(k=><option key={k}>{k}</option>)}</select></label>
   <label className="text-sm">Site name<input className={inputClass} value={site} disabled={busy} onChange={e=>setSite(e.target.value)}/></label>
   <label className="text-sm">Scheduled at<input className={inputClass} type="datetime-local" value={scheduled} disabled={busy}
    onChange={e=>setScheduled(e.target.value)}/></label>
   <button className={btnClass} disabled={busy||!customerId||!branchId} type="button" onClick={createVisit}>
    {pending.current.visit?"Retry same visit":"Create site visit"}</button>
  </div>
  <h2 className="font-semibold">Visit inspection & handover</h2>
  <select className={inputClass} disabled={busy} value={visitId} onChange={e=>setVisitId(e.target.value)}>
   <option value="">Select a scheduled visit</option>
   {visits.filter(v=>v.status==="scheduled").map(v=><option key={v.id} value={v.id}>{v.site_name} · {v.id.slice(0,8)}</option>)}
  </select>
  {activeVisit&&<p className="text-xs">{activeVisit.service_kind} · scheduled {new Date(activeVisit.scheduled_at).toLocaleString()} · events {events.filter(e=>e.visit_id===visitId).length}</p>}
  <div className="grid gap-4 sm:grid-cols-2">
   <section className="space-y-2 rounded border p-3">
    <h3 className="text-sm font-semibold">Inspection checklist</h3>
    <input className={inputClass} value={check} disabled={busy} onChange={e=>setCheck(e.target.value)}/>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={passed} disabled={busy} onChange={e=>setPassed(e.target.checked)}/> Passed</label>
    <button className={btnClass} disabled={busy||!visitId} onClick={()=>append("checklist",{items:[{name:check.trim(),passed}]})}>
     {pending.current["checklist:"+visitId]?"Retry checklist":"Save checklist"}</button>
   </section>
   <section className="space-y-2 rounded border p-3">
    <h3 className="text-sm font-semibold">Photo / PDF HTTPS evidence</h3>
    <select className={inputClass} value={evidenceKind} onChange={e=>setEvidenceKind(e.target.value as "photo"|"pdf")}>
     <option value="photo">Photo</option><option value="pdf">PDF</option></select>
    <input className={inputClass} type="url" placeholder="https://…" disabled={busy}
     value={url} onChange={e=>setUrl(e.target.value)}/>
    <button className={btnClass} disabled={busy||!visitId} onClick={()=>append("evidence",{kind:evidenceKind,url:url.trim()})}>
     {pending.current["evidence:"+visitId]?"Retry evidence":"Save evidence URL"}</button>
   </section>
  </div>
  <section className="space-y-2 rounded border p-3">
   <h3 className="text-sm font-semibold">Customer signature & handover</h3>
   <input className={inputClass} value={signedBy} disabled={busy} placeholder="Customer full name" onChange={e=>setSignedBy(e.target.value)}/>
   <canvas width={320} height={120} ref={canvas}
    className="h-[120px] w-full max-w-[400px] touch-none rounded border bg-white"
    aria-label="Draw customer handover signature"
    onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={endStroke}
    onPointerCancel={endStroke}/>
   <button className="min-h-[44px] rounded border px-3 text-sm" type="button" disabled={busy}
    onClick={()=>{canvas.current?.getContext("2d")?.clearRect(0,0,320,120);strokes.current=0}}>Clear signature</button>
   <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>
    Customer agrees to the completed handover</label>
   <button className={btnClass} disabled={busy||!visitId} type="button" onClick={handover}>
    {pending.current["handover:"+visitId]?"Retry signature handover":"Confirm customer handover"}</button>
  </section>
  <section className="space-y-2 rounded border p-3">
   <h3 className="text-sm font-semibold">AMC register</h3>
   <div className="grid gap-2 sm:grid-cols-3">
    <label className="text-sm">Start<input className={inputClass} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label className="text-sm">End<input className={inputClass} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label className="text-sm">Annual value ₹<input className={inputClass} value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)}/></label>
   </div>
   <button className={btnClass} type="button" disabled={busy||!customerId||!branchId} onClick={newAmc}>
    {pending.current.amc?"Retry same AMC":"Create AMC contract"}</button>
   <p className="text-xs text-slate-600">Saved AMC agreements: {agreements.length}</p>
  </section>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
 </main>;
}
