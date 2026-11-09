"use client";
import * as React from "react";
import {configFromEnv,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";
type Lead={id:string;buyer_name:string;buyer_phone:string;source:string;message:string;created_at:string;customer_id:string};
export function MarketingLeads(){
 const [leads,setLeads]=React.useState<Lead[]>([]);
 const [error,setError]=React.useState("");
 React.useEffect(()=>{
  let active=true;
  void (async()=>{
   const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
   if(!cfg||!token||!user?.id)throw new Error("Cloud sign-in required.");
   const auth=await resolveOnlineAuthorization(token,user.id);
   if(!auth.ok)throw new Error(auth.error);
   if(getOutboxScope()!==auth.orgId+":"+user.id||!can("products.manage"))
    throw new Error("Storefront CRM access denied.");
   const res=await pgSelect<Lead>({...cfg,accessToken:token},"saas_marketing_leads",
     "select=id,buyer_name,buyer_phone,source,message,created_at,customer_id&org_id=eq."+
     auth.orgId+"&order=created_at.desc&limit=100");
   if(res.error||!res.data)throw new Error(res.error?.message||"CRM leads unavailable.");
   if(token!==getSessionToken()||user.id!==getSessionUser()?.id)
    throw new Error("User changed during CRM read.");
   if(active)setLeads(res.data);
  })().catch(e=>{if(active)setError(String(e.message||e));});
  return()=>{active=false;};
 },[]);
 return <section className="space-y-2 rounded-lg border p-3">
  <h2 className="font-semibold">Storefront & social enquiries ({leads.length})</h2>
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  {leads.map(l=><div key={l.id} className="rounded border p-2 text-sm">
   <strong>{l.buyer_name}</strong> · {l.buyer_phone} · {l.source}
   <p className="text-xs">{l.message}</p>
   <p className="text-xs text-slate-500">CRM customer {l.customer_id.slice(0,8)} · {new Date(l.created_at).toLocaleString()}</p>
  </div>)}
 </section>;
}
