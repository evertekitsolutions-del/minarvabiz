"use client";
import * as React from "react";
import {configFromEnv,pgRpc} from "@minarvabiz/database";

type Source="website"|"whatsapp"|"facebook"|"instagram";
type LeadPayload={id:string;name:string;phone:string;source:Source;message:string};
const SOURCES:Source[]=["website","whatsapp","facebook","instagram"];

export function LeadCapture({slug}:{slug:string}){
 const [name,setName]=React.useState("");
 const [phone,setPhone]=React.useState("");
 const [source,setSource]=React.useState<Source>("website");
 const [message,setMessage]=React.useState("");
 const [consent,setConsent]=React.useState(false);
 const [busy,setBusy]=React.useState(false);
 const [notice,setNotice]=React.useState("");
 const [error,setError]=React.useState("");
 const pending=React.useRef<LeadPayload|null>(null);
 const inFlight=React.useRef(false);
 React.useEffect(()=>{
  const attribution=new URLSearchParams(window.location.search).get("source");
  if(SOURCES.includes(attribution as Source))setSource(attribution as Source);
 },[]);
 async function submit(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   if(!consent)throw new Error("Please consent before sending your enquiry.");
   if(!pending.current){
    const n=name.trim(),p=phone.trim(),m=message.trim();
    if(!n||n.length>120||!/^\\+?[0-9]{10,15}$/.test(p)||m.length>500)
     throw new Error("Enter a valid name, phone and a message up to 500 characters.");
    pending.current={id:crypto.randomUUID(),name:n,phone:p,source,message:m};
   }
   const p=pending.current;
   if(!p)throw new Error("Enquiry unavailable.");
   const cfg=configFromEnv();
   if(!cfg)throw new Error("Store API unavailable.");
   const result=await pgRpc<{lead_id:string;customer_id:string}>(cfg,
     "saas_capture_storefront_lead",{
       p_lead_id:p.id,p_slug:slug,p_buyer_name:p.name,p_buyer_phone:p.phone,
       p_source:p.source,p_message:p.message,p_marketing_consent:true,
     });
   if(result.error||result.data?.lead_id!==p.id||!result.data.customer_id)
    throw new Error(result.error?.message||"CRM confirmation failed. Retry this enquiry.");
   pending.current=null;
   setNotice("Your enquiry was saved in the merchant's CRM.");
   setName("");setPhone("");setMessage("");setConsent(false);
  }catch(e){setError(e instanceof Error?e.message:"Enquiry not confirmed.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 const locked=busy||!!pending.current;
 return <section className="space-y-3 rounded-lg border p-4">
  <h2 className="text-lg font-semibold">Ask about a product</h2>
  <p className="text-xs text-slate-600">Send an enquiry to this store. No purchase or payment is made.</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <label className="text-sm">Name<input className="mt-1 w-full rounded border p-2"
    value={name} disabled={locked} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
   <label className="text-sm">Phone<input className="mt-1 w-full rounded border p-2"
    value={phone} disabled={locked} onChange={e=>setPhone(e.target.value)} autoComplete="tel"/></label>
  </div>
  <label className="block text-sm">Where did you find us?
   <select className="mt-1 w-full rounded border p-2" value={source} disabled={locked}
    onChange={e=>setSource(e.target.value as Source)}>
    {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
   </select>
  </label>
  <label className="block text-sm">Enquiry<textarea className="mt-1 w-full rounded border p-2"
    value={message} disabled={locked} maxLength={500}
    onChange={e=>setMessage(e.target.value)}/></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent}
   disabled={locked} onChange={e=>setConsent(e.target.checked)}/>
   I agree to have my contact details saved for this store to respond to my enquiry.</label>
  <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50" type="button"
   disabled={busy||(!pending.current&&!consent)} onClick={()=>{void submit()}}>
   {busy?"Saving enquiry…":pending.current?"Retry same enquiry":"Send enquiry"}
  </button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
 </section>;
}
