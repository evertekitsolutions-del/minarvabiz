"use client";
import * as React from "react";
import {supabase} from "@/lib/supabase";
import {
 VERTICALS,OPTIONAL_MODULES,CURRENCIES,isPrimary,isVertical,
 parseTenantIndustryProfile,type TenantIndustryProfile,
 type PrimaryIndustry,type VerticalId,type OptionalModule,
 type ProfileCurrency,type ProfileLanguage,
} from "@/lib/tenant-industry";

type Draft={primary:PrimaryIndustry|null;verticals:VerticalId[];modules:OptionalModule[];
 country:string;currency:ProfileCurrency;language:ProfileLanguage};
function toDraft(p:TenantIndustryProfile):Draft {
 return {primary:p.primary_vertical,verticals:[...p.enabled_verticals],
  modules:[...p.enabled_modules],country:p.country_code,
  currency:p.currency_code,language:p.language_code};
}
const input="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white p-3";
export default function IndustrySettingsPage(){
 const [profile,setProfile]=React.useState<TenantIndustryProfile|null>(null);
 const [draft,setDraft]=React.useState<Draft|null>(null);
 const [userId,setUserId]=React.useState<string|null>(null);
 const [editable,setEditable]=React.useState(false);
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const flight=React.useRef(false);

 const reload=React.useCallback(async()=>{
  if(!supabase)throw new Error("Cloud account is unavailable.");
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error("Sign in before selecting your business industry.");
  const membership=await supabase.from("organization_members")
   .select("org_id,role").eq("user_id",user.id).limit(2);
  if(membership.error||membership.data?.length!==1)throw new Error("Unique verified tenant membership required.");
  const org=membership.data[0].org_id;
  const res=await supabase.from("saas_tenant_industry_profiles")
   .select("org_id,primary_vertical,enabled_verticals,enabled_modules,country_code,currency_code,language_code,updated_at")
   .eq("org_id",org).maybeSingle();
  if(res.error||!res.data)throw new Error("Industry profile not provisioned. Contact support.");
  const parsed=parseTenantIndustryProfile(res.data);
  if(parsed.org_id!==org)throw new Error("Tenant industry readback scope mismatch");
  setUserId(user.id);setEditable(["admin","super_admin"].includes(membership.data[0].role));
  setProfile(parsed);setDraft(toDraft(parsed));setError("");
 },[]);
 React.useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:"Cannot read tenant settings"));},[reload]);

 async function save(){
  if(!supabase||!profile||!draft||!userId||!editable||flight.current)return;
  setError("");setNotice("");flight.current=true;setBusy(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||user?.id!==userId)throw new Error("Authentication changed. Reload and retry.");
   if(draft.primary && !isPrimary(draft.primary))throw new Error("Select a valid industry.");
   if(draft.primary!=="multi_vertical"&&draft.primary!==null&&!draft.verticals.includes(draft.primary))
    throw new Error("Primary industry must be selected.");
   if(draft.primary==="multi_vertical"&&!draft.verticals.length)
    throw new Error("Select at least one sector for a multi-vertical company.");
   if(!/^[A-Z]{2}$/.test(draft.country))throw new Error("Use a valid ISO country code.");
   if(!draft.verticals.every(isVertical))throw new Error("Invalid selected industry.");
   const patch={
    primary_vertical:draft.primary,enabled_verticals:[...new Set(draft.verticals)],
    enabled_modules:[...new Set(draft.modules)],country_code:draft.country,
    currency_code:draft.currency,language_code:draft.language,
   };
   // Version check prevents clobbering a newer browser edit. Database RLS authorizes administrator.
   const updated=await supabase.from("saas_tenant_industry_profiles").update(patch)
    .eq("org_id",profile.org_id).eq("updated_at",profile.updated_at)
    .select("org_id,primary_vertical,enabled_verticals,enabled_modules,country_code,currency_code,language_code,updated_at").maybeSingle();
   if(updated.error||!updated.data)throw new Error(updated.error?.message||"Settings changed elsewhere or update denied. Reload.");
   const confirmed=parseTenantIndustryProfile(updated.data);
   if(confirmed.org_id!==profile.org_id)throw new Error("Server tenant readback mismatch.");
   setProfile(confirmed);setDraft(toDraft(confirmed));setNotice("Tenant industry profile saved in Supabase.");
   window.dispatchEvent(new CustomEvent("minarva:industry-profile-updated",{detail:{org_id:confirmed.org_id}}));
  }catch(e){setError(e instanceof Error?e.message:"Tenant settings were not saved");}
  finally{flight.current=false;setBusy(false);}
 }
 function toggleVertical(id:VerticalId,enabled:boolean){
  setDraft(p=>{
   if(!p)return p;
   const verticals=enabled?[...new Set([...p.verticals,id])]:p.verticals.filter(x=>x!==id);
   const primary=p.primary===id&&!enabled?null:p.primary;
   return {...p,verticals,primary};
  });
 }
 function toggleModule(id:OptionalModule,enabled:boolean){
  setDraft(p=>p?{...p,modules:enabled?[...new Set([...p.modules,id])]:p.modules.filter(x=>x!==id)}:p);
 }
 return <main className="mx-auto max-w-3xl space-y-5" aria-label="Business industry and apps">
  <header><h1 className="text-2xl font-bold">Business Industry & Apps</h1>
   <p className="mt-2 text-sm text-slate-600">Configure a single global ERP for your actual business type. This is a company-wide, cloud-saved profile; it is never a substitute for permission or paid entitlement.</p>
  </header>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  {!draft&&<p role="status">Loading verified tenant settings…</p>}
  {draft&&<fieldset disabled={!editable||busy} className="space-y-5">
   {!editable&&<p className="text-sm text-amber-700">Only a verified organization admin can change business settings.</p>}
   <label className="block text-sm font-semibold">Primary industry
    <select className={input} value={draft.primary??""}
     onChange={e=>{const value=e.target.value;setDraft(p=>{
      if(!p)return p;
      const next=isPrimary(value)?value:null;
      return {...p,primary:next,verticals:next&&next!=="multi_vertical"?[next]:p.verticals};
     });}}>
      <option value="">Not configured</option>
      {VERTICALS.map(v=><option value={v.id} key={v.id}>{v.label}</option>)}
      <option value="multi_vertical">Multi-Vertical Business</option>
    </select>
   </label>
   <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="mb-3 font-semibold">Enabled industry sectors</h2>
    <div className="grid gap-3 sm:grid-cols-2">{VERTICALS.map(v=><label key={v.id} className="flex items-start gap-2 text-sm">
     <input type="checkbox" className="mt-1" checked={draft.verticals.includes(v.id)}
       onChange={e=>toggleVertical(v.id,e.target.checked)}/>
     <span>{v.label}</span>
    </label>)}</div>
   </section>
   <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="mb-2 font-semibold">Optional apps</h2>
    <p className="mb-3 text-xs text-amber-700">Apps visibility is a preference only. Disabled, unreleased or unlicensed capabilities remain unavailable regardless of this selection.</p>
    <div className="grid gap-3 sm:grid-cols-2">{OPTIONAL_MODULES.map(m=><label key={m.id} className="flex items-start gap-2 text-sm">
     <input type="checkbox" className="mt-1" checked={draft.modules.includes(m.id)}
      onChange={e=>toggleModule(m.id,e.target.checked)}/>
     <span>{m.label}</span>
    </label>)}</div>
   </section>
   <div className="grid gap-4 sm:grid-cols-3">
    <label className="text-sm font-semibold">Country code
     <input className={input} value={draft.country} maxLength={2} pattern="[A-Z]{2}"
      onChange={e=>setDraft(p=>p?{...p,country:e.target.value.toUpperCase()}:p)}/></label>
    <label className="text-sm font-semibold">Reporting currency
     <select className={input} value={draft.currency} onChange={e=>setDraft(p=>p?{...p,currency:e.target.value as ProfileCurrency}:p)}>
       {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
     </select></label>
    <label className="text-sm font-semibold">Preferred language
     <select className={input} value={draft.language} onChange={e=>setDraft(p=>p?{...p,language:e.target.value as ProfileLanguage}:p)}>
      <option value="en">English</option><option value="ar">Arabic (staged)</option>
     </select></label>
   </div>
   <p className="text-xs text-amber-800">Changing reporting currency does not reprice historical invoices or activate multi-currency checkout. Country VAT/GST, medicine compliance and Arabic invoice translations require separately verified rules.</p>
   <div className="flex gap-3"><button className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save industry & apps"}</button>
    <button className="rounded-lg border border-slate-300 px-4 py-3" type="button" onClick={()=>void reload().catch(e=>setError(String(e)))}>Reload server profile</button></div>
  </fieldset>}
 </main>;
}
