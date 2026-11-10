"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";
type Store={id:string;org_id:string;slug:string};
type Lead={id:string;buyer_name:string;source:string;consent_at:string};
type Template={id:string;name:string;channel:string};
type Coupon={id:string;code:string;discount_kind:string;discount_value:number};
type Trigger={id:string;delivery_state:string};
type Pending={id:string;body:string};
const control="mt-1 min-h-[44px] w-full rounded border p-2 text-sm";
export function SaasMarketingCampaignPanel({store}:{store:Store|null}){
 const [leads,setLeads]=React.useState<Lead[]>([]);
 const [templates,setTemplates]=React.useState<Template[]>([]);
 const [coupons,setCoupons]=React.useState<Coupon[]>([]);
 const [queued,setQueued]=React.useState<Trigger[]>([]);
 const [code,setCode]=React.useState("");
 const [discountKind,setDiscountKind]=React.useState<"percent"|"fixed">("percent");
 const [discount,setDiscount]=React.useState("10");
 const [templateName,setTemplateName]=React.useState("Welcome");
 const [channel,setChannel]=React.useState<"whatsapp"|"sms"|"email">("whatsapp");
 const [body,setBody]=React.useState("Hello {{name}}, thank you for contacting our store.");
 const [leadId,setLeadId]=React.useState("");
 const [templateId,setTemplateId]=React.useState("");
 const [error,setError]=React.useState("");
 const [status,setStatus]=React.useState("");
 const [busy,setBusy]=React.useState(false);
 const pending=React.useRef<Record<string,Pending>>({});
 const inFlight=React.useRef(false);
 async function context(){
  const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!store||!cfg||!token||!user?.id)throw new Error("Published tenant store admin session required.");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok||getOutboxScope()!==a.orgId+":"+user.id||
   a.orgId!==store.org_id||!can("products.manage"))
   throw new Error("Tenant marketing administration denied.");
  return {cfg:{...cfg,accessToken:token},token,user:user.id,org:a.orgId};
 }
 const load=React.useCallback(async()=>{
  if(!store)return;
  const a=await context();
  const [l,t,c,q]=await Promise.all([
   pgSelect<Lead>(a.cfg,"saas_marketing_leads",
    "select=id,buyer_name,source,consent_at&org_id=eq."+a.org+
    "&storefront_id=eq."+store.id+"&order=created_at.desc&limit=100"),
   pgSelect<Template>(a.cfg,"saas_marketing_campaign_templates",
    "select=id,name,channel&org_id=eq."+a.org+"&storefront_id=eq."+store.id+"&limit=100"),
   pgSelect<Coupon>(a.cfg,"saas_marketing_coupons",
    "select=id,code,discount_kind,discount_value&org_id=eq."+a.org+
    "&storefront_id=eq."+store.id+"&limit=100"),
   pgSelect<Trigger>(a.cfg,"saas_marketing_campaign_trigger_log",
    "select=id,delivery_state&org_id=eq."+a.org+"&storefront_id=eq."+store.id+"&limit=100"),
  ]);
  if(l.error||t.error||c.error||q.error||!l.data||!t.data||!c.data||!q.data)
   throw new Error(l.error?.message||t.error?.message||c.error?.message||q.error?.message||
    "Campaign data unavailable.");
  if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)return;
  setLeads(l.data);setTemplates(t.data);setCoupons(c.data);setQueued(q.data);
  setLeadId(p=>l.data?.some(x=>x.id===p)?p:l.data?.[0]?.id||"");
  setTemplateId(p=>t.data?.some(x=>x.id===p)?p:t.data?.[0]?.id||"");
 },[store?.id,store?.org_id]);
 React.useEffect(()=>{let live=true;void load().catch(e=>{if(live)setError(String(e?.message||e))});return()=>{live=false};},[load]);
 async function run(k:string,rpc:string,args:Record<string,unknown>,
  table:string,idKey:string){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setStatus("");
  try{
   const body=JSON.stringify({rpc,args});
   pending.current[k]??={id:crypto.randomUUID(),body};
   if(pending.current[k].body!==body)throw new Error("Request changed during pending retry. Refresh before editing.");
   const id=pending.current[k].id,a=await context();
   const r=await pgRpc<Record<string,unknown>>(a.cfg,rpc,{...args,[idKey]:id});
   if(r.error||!r.data||!Object.values(r.data).includes(id))
    throw new Error(r.error?.message||"Campaign RPC not confirmed; retry same id.");
   const read=await pgSelect<{id:string}>(a.cfg,table,
    "select=id&id=eq."+id+"&org_id=eq."+a.org+"&limit=2");
   if(read.error||read.data?.length!==1)
    throw new Error("Campaign receipt not persisted; retry same id.");
   if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
    throw new Error("Session changed during marketing operation.");
   delete pending.current[k];
   await load();
   setStatus("Verified in Supabase. Message queued in draft log only, no external delivery.");
  }catch(e){setError(e instanceof Error?e.message:"Marketing operation unavailable.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 const makeCoupon=()=>{
  if(!store)return;
  const val=Number(discount);
  void run("coupon","saas_create_store_coupon_once",{
   p_store_id:store.id,p_code:code.trim().toUpperCase(),p_discount_kind:discountKind,
   p_discount_value:val,p_valid_from:new Date(Date.now()-60000).toISOString(),
   p_valid_until:new Date(Date.now()+30*86400000).toISOString(),
  },"saas_marketing_coupons","p_coupon_id");
 };
 const makeTemplate=()=>{
  if(!store)return;
  void run("template","saas_create_campaign_template_once",{
   p_store_id:store.id,p_name:templateName.trim(),p_channel:channel,
   p_body:body.trim()
  },"saas_marketing_campaign_templates","p_template_id");
 };
 const queue=()=>{
  if(!leadId||!templateId)return;
  void run("trigger:"+leadId+":"+templateId,"saas_queue_lead_campaign_once",{
   p_lead_id:leadId,p_template_id:templateId
  },"saas_marketing_campaign_trigger_log","p_trigger_id");
 };
 if(!store)return <section className="rounded border p-3 text-sm">Create a store to manage campaigns.</section>;
 return <section className="space-y-3 rounded border p-3">
  <h2 className="font-semibold">CRM coupons & consented campaign trigger log</h2>
  <p className="text-xs text-slate-600">Coupon validation is preview-only until financial checkout redemption ships. Campaigns are never sent automatically; audit log state is queued_no_transport.</p>
  <div className="grid gap-2 sm:grid-cols-4">
   <label className="text-sm">Promo code<input className={control} maxLength={20}
    value={code} disabled={busy||!!pending.current.coupon} onChange={e=>setCode(e.target.value)}/></label>
   <label className="text-sm">Discount type<select className={control}
    value={discountKind} disabled={busy||!!pending.current.coupon}
    onChange={e=>setDiscountKind(e.target.value as "percent"|"fixed")}>
    <option value="percent">Percent</option><option value="fixed">₹ amount</option></select></label>
   <label className="text-sm">Discount value<input className={control} inputMode="decimal"
    value={discount} disabled={busy||!!pending.current.coupon}
    onChange={e=>setDiscount(e.target.value)}/></label>
   <button className="min-h-[44px] self-end rounded bg-slate-900 px-4 text-white disabled:opacity-50"
    disabled={busy} onClick={makeCoupon}>
    {pending.current.coupon?"Retry coupon":"Save coupon"}</button>
  </div>
  <p className="text-xs">Coupons: {coupons.map(c=>c.code+" ("+c.discount_value+(c.discount_kind==="percent"?"%":" ₹")+")").join(", ")||"None"}</p>
  <div className="grid gap-2 sm:grid-cols-3">
   <label className="text-sm">Template name<input className={control}
    disabled={busy||!!pending.current.template} value={templateName}
    onChange={e=>setTemplateName(e.target.value)}/></label>
   <label className="text-sm">Channel<select className={control}
    disabled={busy||!!pending.current.template} value={channel}
    onChange={e=>setChannel(e.target.value as "whatsapp"|"sms"|"email")}>
    <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
    <option value="email">Email</option></select></label>
   <button className="min-h-[44px] self-end rounded border px-4 disabled:opacity-50"
    disabled={busy} onClick={makeTemplate}>
    {pending.current.template?"Retry template":"Save template"}</button>
   <label className="text-sm sm:col-span-3">Template body<textarea className={control}
    disabled={busy||!!pending.current.template} value={body}
    onChange={e=>setBody(e.target.value)}/></label>
  </div>
  <div className="grid gap-2 sm:grid-cols-3">
   <label className="text-sm">Opt-in lead<select className={control}
    value={leadId} disabled={busy} onChange={e=>setLeadId(e.target.value)}>
    {leads.map(l=><option key={l.id} value={l.id}>{l.buyer_name} · {l.source}</option>)}</select></label>
   <label className="text-sm">Template<select className={control}
    value={templateId} disabled={busy} onChange={e=>setTemplateId(e.target.value)}>
    {templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.channel}</option>)}</select></label>
   <button className="min-h-[44px] self-end rounded border px-4 disabled:opacity-50"
    disabled={busy||!leadId||!templateId} onClick={queue}>Queue campaign audit</button>
  </div>
  <p className="text-xs text-slate-600">Campaign trigger rows: {queued.length} · no messages transmitted</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {status&&<p role="status" className="text-sm text-green-700">{status}</p>}
 </section>;
}
