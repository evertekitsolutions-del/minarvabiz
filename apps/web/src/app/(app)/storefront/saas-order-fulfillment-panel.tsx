"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Order={id:string;buyer_name:string;total:number;status:string;created_at:string};
type Branch={id:string;name:string};
type Pending={id:string;request:string};
type Transition="confirmed"|"packed"|"shipped"|"delivered"|"cancelled"|"expired";
const NEXT:Record<string,Transition[]>={
 pending_review:["confirmed","cancelled","expired"],confirmed:["packed"],
 packed:["shipped"],shipped:["delivered"]
};
export function SaasOrderFulfillmentPanel({
 orders,onChanged
}:{orders:Order[];onChanged:()=>void}){
 const [branches,setBranches]=React.useState<Branch[]>([]);
 const [branch,setBranch]=React.useState("");
 const [tracking,setTracking]=React.useState("");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const pending=React.useRef<Record<string,Pending>>({});
 const inFlight=React.useRef(false);
 async function context(){
  const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!cfg||!token||!user?.id)throw new Error("Cloud sign-in required.");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok||getOutboxScope()!==a.orgId+":"+user.id||!can("sales.create"))
   throw new Error("Merchant order fulfillment permission required.");
  return {cfg:{...cfg,accessToken:token},token,user:user.id,org:a.orgId};
 }
 const load=React.useCallback(async()=>{
  const a=await context();
  const res=await pgSelect<Branch>(a.cfg,"branches",
   "select=id,name&org_id=eq."+a.org+"&is_active=eq.true&deleted_at=is.null&limit=100");
  if(res.error||!res.data)throw new Error(res.error?.message||"Branches not available.");
  if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)return;
  setBranches(res.data);setBranch(b=>res.data?.some(x=>x.id===b)?b:res.data?.[0]?.id||"");
 },[]);
 React.useEffect(()=>{let live=true;void load().catch(e=>{if(live)setError(String(e?.message||e))});return()=>{live=false};},[load]);
 async function submit(order:Order,target:Transition){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  const k=order.id+":"+target;
  try{
   const ref=target==="shipped"?tracking.trim():null;
   const body=JSON.stringify({order:order.id,target,branch,ref});
   pending.current[k]??={id:crypto.randomUUID(),request:body};
   if(pending.current[k].request!==body)
    throw new Error("Shipping or branch details changed during retry; reload first.");
   const a=await context(),id=pending.current[k].id;
   const r=await pgRpc<{event_id:string;order_id:string;status:string;sale_id?:string}>(
    a.cfg,"saas_online_order_transition",{
    p_event_id:id,p_order_id:order.id,p_target_status:target,
    p_branch_id:branch,p_tracking_ref:ref});
   if(r.error||r.data?.event_id!==id||r.data.status!==target)
    throw new Error(r.error?.message||"State change not acknowledged; retry same event ID.");
   const [event,current,sale]=await Promise.all([
    pgSelect<{id:string;new_status:string}>(a.cfg,"saas_storefront_fulfillment_events",
     "select=id,new_status&id=eq."+id+"&org_id=eq."+a.org+"&limit=2"),
    pgSelect<{id:string;status:string}>(a.cfg,"saas_storefront_draft_orders",
     "select=id,status&id=eq."+order.id+"&org_id=eq."+a.org+"&limit=2"),
    target==="confirmed"?pgSelect<{id:string;paid_amount:number;balance_amount:number}>(
     a.cfg,"sales","select=id,paid_amount,balance_amount&id=eq."+order.id+"&org_id=eq."+a.org+"&limit=2"):
     Promise.resolve({data:[] as {id:string;paid_amount:number;balance_amount:number}[],error:null})
   ]);
   if(event.error||current.error||sale.error||event.data?.length!==1||
     current.data?.length!==1||current.data[0].status!==target||
     (target==="confirmed"&&(sale.data?.length!==1||
      Number(sale.data[0].paid_amount)!==0||
      Number(sale.data[0].balance_amount)!==Number(order.total))))
    throw new Error("Order/stock event or unpaid invoice readback not confirmed; retry same ID.");
   if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
    throw new Error("Session changed; refresh order data.");
   delete pending.current[k];
   onChanged();setNotice("Order "+order.id.slice(0,8)+" → "+target+" saved and verified in Supabase.");
  }catch(e){setError(e instanceof Error?e.message:"Order transition unverified.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="space-y-3 rounded border p-3">
  <h2 className="font-semibold">Stock-backed order fulfillment</h2>
  <p className="text-xs text-slate-600">Confirm only before the 15-minute hold expires. Confirmation posts ONE unpaid invoice and deducts global/branch stock; cancellation/expiry releases uncommitted holds. No card payment is collected. Confirmed sales cannot be cancelled here without a proper return/refund workflow.</p>
  <label className="block text-sm">Dispatch branch
   <select className="mt-1 min-h-[44px] w-full rounded border p-2"
    value={branch} disabled={busy} onChange={e=>setBranch(e.target.value)}>
    {branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select>
  </label>
  <label className="block text-sm">Courier tracking (required for shipped)
   <input className="mt-1 min-h-[44px] w-full rounded border p-2"
    value={tracking} disabled={busy}
    onChange={e=>setTracking(e.target.value)} placeholder="Tracking reference"/></label>
  <div className="space-y-2">
   {orders.filter(o=>NEXT[o.status]?.length).slice(0,30).map(o=><div key={o.id}
    className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
    <span className="min-w-0 flex-1">{o.id.slice(0,8)} · {o.buyer_name}
      · ₹{Number(o.total).toFixed(2)} · {o.status}</span>
    {NEXT[o.status].map(action=><button type="button" key={action}
     className="min-h-[44px] rounded border px-3 disabled:opacity-50"
     disabled={busy||!branch||(action==="shipped"&&tracking.trim().length<4)}
     onClick={()=>{void submit(o,action)}}>
      {pending.current[o.id+":"+action]?"Retry ":""}{action}</button>)}
   </div>)}
  </div>
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
