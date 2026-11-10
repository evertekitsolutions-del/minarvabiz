"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";
type Store={id:string;org_id:string;seo_title:string;seo_description:string;banner_url:string;accent_color:string};
type Design={seo_title:string;seo_description:string;banner_url:string;accent_color:string};
export function SaasStorefrontDesignPanel({store}:{store:Store|null}){
 const [design,setDesign]=React.useState<Design>({
 seo_title:"",seo_description:"",banner_url:"",accent_color:"#1760e6"});
 const [error,setError]=React.useState("");
 const [status,setStatus]=React.useState("");
 const [busy,setBusy]=React.useState(false);
 const flight=React.useRef(false);
 const pending=React.useRef<{id:string;request:string}|null>(null);
 React.useEffect(()=>{
  if(store&&!pending.current)setDesign({
   seo_title:store.seo_title||"",seo_description:store.seo_description||"",
   banner_url:store.banner_url||"",accent_color:store.accent_color||"#1760e6"});
 },[store?.id,store?.seo_title,store?.seo_description,store?.banner_url,store?.accent_color]);
 async function save(){
  if(flight.current)return;
  flight.current=true;setBusy(true);setError("");setStatus("");
  try{
   if(!store)throw new Error("Publish the store before updating its design.");
   const normalized={seo_title:design.seo_title.trim(),
    seo_description:design.seo_description.trim(),
    banner_url:design.banner_url.trim(),accent_color:design.accent_color.trim()};
   if(normalized.seo_title.length>65||normalized.seo_description.length>160||
    (normalized.banner_url&&!/^https:\/\/\S{1,1490}$/.test(normalized.banner_url))||
    !/^#[0-9a-fA-F]{6}$/.test(normalized.accent_color))
    throw new Error("Invalid SEO title, description, HTTPS banner or accent color.");
   const request=JSON.stringify({store:store.id,design:normalized});
   pending.current??={id:crypto.randomUUID(),request};
   if(pending.current.request!==request)throw new Error("Design changed during pending retry. Refresh before another save.");
   const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
   if(!cfg||!token||!user?.id)throw new Error("Cloud sign-in required.");
   const a=await resolveOnlineAuthorization(token,user.id);
   if(!a.ok||a.orgId!==store.org_id||getOutboxScope()!==a.orgId+":"+user.id||!can("products.manage"))
    throw new Error("Store design tenant admin required.");
   const active={...cfg,accessToken:token},id=pending.current.id;
   const r=await pgRpc<{update_id:string}>(active,"saas_storefront_update_design_once",{
    p_update_id:id,p_storefront_id:store.id,p_design:normalized});
   if(r.error||r.data?.update_id!==id)
    throw new Error(r.error?.message||"Cloud design receipt not confirmed.");
   const receipt=await pgSelect<{id:string}>(active,"saas_storefront_design_receipts",
    "select=id&id=eq."+id+"&org_id=eq."+a.orgId+"&limit=2");
   const check=await pgSelect<Store>(active,"saas_storefronts",
    "select=id,org_id,seo_title,seo_description,banner_url,accent_color&id=eq."+store.id+"&org_id=eq."+a.orgId+"&limit=2");
   if(receipt.error||check.error||receipt.data?.length!==1||check.data?.length!==1||
    check.data[0].seo_title!==normalized.seo_title||check.data[0].banner_url!==normalized.banner_url)
    throw new Error("Design readback not confirmed; retry same id.");
   if(token!==getSessionToken()||user.id!==getSessionUser()?.id)
    throw new Error("Account changed during store update.");
   pending.current=null;
   setStatus("Public store SEO, theme and banner persisted in Supabase.");
  }catch(e){setError(e instanceof Error?e.message:"Store design not verified.");}
  finally{flight.current=false;setBusy(false);}
 }
 const field=(k:keyof Design,v:string)=>setDesign(p=>({...p,[k]:v}));
 return <section className="space-y-2 rounded border p-3">
  <h2 className="font-semibold">SEO & storefront theme</h2>
  <div className="grid gap-2 sm:grid-cols-2">
   <label className="text-sm">SEO title (65 characters max)
    <input className="mt-1 min-h-[44px] w-full rounded border p-2" maxLength={65}
     disabled={busy||!!pending.current} value={design.seo_title}
     onChange={e=>field("seo_title",e.target.value)}/></label>
   <label className="text-sm">Accent color
    <input className="mt-1 min-h-[44px] w-full rounded border p-2"
     type="color" disabled={busy||!!pending.current} value={design.accent_color}
     onChange={e=>field("accent_color",e.target.value)}/></label>
   <label className="text-sm sm:col-span-2">SEO description
    <textarea className="mt-1 w-full rounded border p-2" maxLength={160}
     disabled={busy||!!pending.current} value={design.seo_description}
     onChange={e=>field("seo_description",e.target.value)}/></label>
   <label className="text-sm sm:col-span-2">Banner image (HTTPS URL)
    <input className="mt-1 min-h-[44px] w-full rounded border p-2" type="url"
     disabled={busy||!!pending.current} value={design.banner_url}
     onChange={e=>field("banner_url",e.target.value)}/></label>
  </div>
  <button className="min-h-[44px] rounded bg-slate-900 px-4 text-white disabled:opacity-50"
   type="button" disabled={busy||!store}
   onClick={()=>{void save()}}>{pending.current?"Retry exact design save":"Save public SEO/theme"}</button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {status&&<p role="status" className="text-sm text-green-700">{status}</p>}
 </section>;
}
