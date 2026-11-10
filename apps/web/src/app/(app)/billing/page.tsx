"use client";
import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {getSessionToken,getSessionUser,getOutboxScope} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Plan={code:string;display_name:string;annual_inr:number;entitlements:string[]};
type Subscription={org_id:string;plan_code:string;state:string;trial_ends_at:string;paid_through:string|null;payment_environment:string};
type Code={id:string;code:string};
type Receipt={id:string;amount_paise:number;environment:string;captured_at:string};
type PartnerCommission={id:string;commission_inr:number;payout_state:string};
type PendingCode={id:string;code:string};
type CheckoutResponse={orderId:string;amountPaise:number;publicKeyId:string;environment:string;error?:string};
const amount=(rupees:number)=>"₹"+Number(rupees).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const button="min-h-[44px] rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50";
declare global{interface Window{Razorpay?:new(options:Record<string,unknown>)=>{open:()=>void}}}
async function loadRazorpayCheckout(){
 if(window.Razorpay)return;
 await new Promise<void>((resolve,reject)=>{
  const existing=document.querySelector<HTMLScriptElement>('script[data-minarva-razorpay="true"]');
  if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Checkout unavailable")),{once:true});return;}
  const script=document.createElement("script");script.src="https://checkout.razorpay.com/v1/checkout.js";
  script.async=true;script.dataset.minarvaRazorpay="true";
  script.onload=()=>resolve();script.onerror=()=>reject(new Error("Secure checkout could not load"));
  document.head.appendChild(script);
 });
}
export default function BillingPage(){
 const [plans,setPlans]=React.useState<Plan[]>([]);
 const [sub,setSub]=React.useState<Subscription|null>(null);
 const [code,setCode]=React.useState<Code|null>(null);
 const [receipts,setReceipts]=React.useState<Receipt[]>([]);
 const [commissions,setCommissions]=React.useState<PartnerCommission[]>([]);
 const [plan,setPlan]=React.useState("base");
 const [referral,setReferral]=React.useState("");
 const [entitled,setEntitled]=React.useState<Record<string,boolean>>({});
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const flight=React.useRef(false);
 const pendingCode=React.useRef<PendingCode|null>(null);
 async function context(){
  const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!cfg||!token||!user?.id)throw new Error("Cloud billing requires a signed-in tenant account");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok||!["admin","super_admin"].includes(a.role)||
   getOutboxScope()!==a.orgId+":"+user.id)
   throw new Error("Only this tenant's verified administrator can change subscriptions");
  return {cfg:{...cfg,accessToken:token},token,user:user.id,org:a.orgId};
 }
 function stableSession(token:string,user:string){
  if(token!==getSessionToken()||user!==getSessionUser()?.id)
   throw new Error("Authentication changed during billing. Refresh before retry.");
 }
 const reload=React.useCallback(async()=>{
  const a=await context();
  const [p,s,c,r,k,billing,ecommerce]=await Promise.all([
   pgSelect<Plan>(a.cfg,"saas_annual_plans",
    "select=code,display_name,annual_inr,entitlements&is_available=eq.true&limit=10"),
   pgSelect<Subscription>(a.cfg,"saas_tenant_subscriptions",
    "select=org_id,plan_code,state,trial_ends_at,paid_through,payment_environment&org_id=eq."+a.org+"&limit=1"),
   pgSelect<Code>(a.cfg,"saas_partner_codes",
    "select=id,code&partner_org_id=eq."+a.org+"&limit=1"),
   pgSelect<Receipt>(a.cfg,"saas_subscription_payment_receipts",
    "select=id,amount_paise,environment,captured_at&org_id=eq."+a.org+"&order=captured_at.desc&limit=15"),
   pgSelect<PartnerCommission>(a.cfg,"saas_partner_referral_commissions",
    "select=id,commission_inr,payout_state&partner_org_id=eq."+a.org+"&order=recorded_at.desc&limit=20"),
   pgRpc<{allowed:boolean}>(a.cfg,"saas_subscription_entitled",{p_feature:"billing"}),
   pgRpc<{allowed:boolean}>(a.cfg,"saas_subscription_entitled",{p_feature:"ecommerce"}),
  ]);
  if(p.error||s.error||c.error||r.error||k.error||billing.error||ecommerce.error||
   !p.data||!s.data||!c.data||!r.data||!k.data)throw new Error(
    p.error?.message||s.error?.message||c.error?.message||r.error?.message||
    k.error?.message||billing.error?.message||ecommerce.error?.message||"Subscription readback unavailable");
  stableSession(a.token,a.user);
  setPlans(p.data);setSub(s.data[0]||null);setCode(c.data[0]||null);
  setReceipts(r.data);setCommissions(k.data);
  setEntitled({billing:billing.data?.allowed===true,ecommerce:ecommerce.data?.allowed===true});
 },[]);
 React.useEffect(()=>{let live=true;void reload().catch(e=>{if(live)setError(String(e instanceof Error?e.message:e))});return()=>{live=false};},[reload]);
 async function action(fn:()=>Promise<string>){
  if(flight.current)return;
  flight.current=true;setBusy(true);setError("");setNotice("");
  try{setNotice(await fn());await reload();}
  catch(e){setError(e instanceof Error?e.message:"Billing operation was not verified");}
  finally{flight.current=false;setBusy(false);}
 }
 function trial(){
  void action(async()=>{
   const a=await context();
   const r=await pgRpc<{org_id:string;state:string;trial_ends_at:string}>(a.cfg,
    "saas_start_tenant_trial_once",{
     p_plan_code:plan,p_partner_code:referral.trim().toUpperCase()||null
    });
   if(r.error||r.data?.org_id!==a.org||!r.data.trial_ends_at)
    throw new Error(r.error?.message||"30-day trial not committed");
   stableSession(a.token,a.user);
   return "30-day trial verified. End: "+new Date(r.data.trial_ends_at).toLocaleDateString();
  });
 }
 function registerPartner(){
  void action(async()=>{
   if(!pendingCode.current){
    const bytes=crypto.getRandomValues(new Uint8Array(6));
    pendingCode.current={id:crypto.randomUUID(),
     code:"MB"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("").toUpperCase()};
   }
   const a=await context(),request=pendingCode.current;
   const r=await pgRpc<{code_id:string;code:string}>(a.cfg,"saas_register_partner_code_once",{
    p_id:request.id,p_code:request.code
   });
   if(r.error||r.data?.code_id!==request.id||r.data.code!==request.code)
    throw new Error(r.error?.message||"Partner code not acknowledged");
   const proof=await pgSelect<Code>(a.cfg,"saas_partner_codes",
    "select=id,code&id=eq."+request.id+"&partner_org_id=eq."+a.org+"&limit=1");
   if(proof.error||proof.data?.length!==1)throw new Error("Partner code not persisted");
   stableSession(a.token,a.user);pendingCode.current=null;
   return "Referral partner code permanently registered";
  });
 }
 function prepareCheckout(){
  void action(async()=>{
   const a=await context();
   const resp=await fetch("/api/billing/checkout",{
    method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+a.token,"Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000)
   });
   const data=await resp.json() as CheckoutResponse;
   if(!resp.ok||!data.orderId||!data.publicKeyId)
    throw new Error(data.error||"Razorpay sandbox credentials are not enabled");
   stableSession(a.token,a.user);
   await loadRazorpayCheckout();
   if(!window.Razorpay)throw new Error("Razorpay Checkout widget unavailable");
   const modal=new window.Razorpay({
    key:data.publicKeyId,amount:data.amountPaise,currency:"INR",order_id:data.orderId,
    name:"Minarva Biz",description:"Annual subscription · "+data.environment,
    handler:()=>setNotice("Gateway response received. Subscription stays unverified until the signed webhook is committed. Select Refresh to check."),
    modal:{ondismiss:()=>setNotice("Checkout dismissed; no payment is confirmed.")}
   });
   modal.open();
   return "Checkout order prepared; await signed server webhook, not the browser success event.";
  });
 }
 return <main className="mx-auto max-w-5xl space-y-5 p-4">
  <header><h1 className="text-2xl font-semibold">Minarva Biz · Subscription & Partner Billing</h1>
   <p className="text-sm text-slate-600">Official annual plan prices before any applicable taxes. Payment checkout requires merchant sandbox credentials; live charging is disabled until the owner enables it.</p></header>
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {plans.map(p=><label key={p.code} className="rounded-xl border p-4">
    <input type="radio" name="plan" value={p.code} disabled={busy||!!sub}
     checked={sub?sub.plan_code===p.code:plan===p.code}
     onChange={()=>setPlan(p.code)}/>
    <h2 className="mt-2 font-semibold">{p.display_name}</h2>
    <p className="mt-1 text-2xl font-bold">{amount(p.annual_inr)}<span className="text-sm font-normal"> /year</span></p>
    <p className="mt-2 text-xs">{p.entitlements.join(" · ")}</p>
   </label>)}
  </section>
  {sub?<section className="space-y-2 rounded border p-4">
    <h2 className="font-semibold">Current tenant subscription</h2>
    <p className="text-sm">Plan <strong>{sub.plan_code}</strong> · State <strong>{sub.state}</strong> · Environment <strong>{sub.payment_environment}</strong></p>
    <p className="text-sm">Trial expiry {new Date(sub.trial_ends_at).toLocaleString()} · Paid through {sub.paid_through?new Date(sub.paid_through).toLocaleString():"not verified"}</p>
    <p className="text-sm">Billing entitlement: {String(entitled.billing)} · E-Commerce entitlement: {String(entitled.ecommerce)}</p>
    {sub.payment_environment==="sandbox"&&<p className="text-xs text-amber-700">Sandbox receipt does not grant real-money paid entitlements or partner payouts.</p>}
    {sub.state!=="active"&&<button className={button} disabled={busy} onClick={prepareCheckout}>Prepare Razorpay checkout</button>}
    <button className="ml-2 min-h-[44px] rounded border px-4" disabled={busy} onClick={()=>{void action(async()=>"Billing refreshed")}}>Refresh verified payment state</button>
   </section>:
   <section className="space-y-2 rounded border p-4">
    <h2 className="font-semibold">Start your 30-day free tenant trial</h2>
    <label className="block text-sm">Partner referral code (optional)
     <input className="mt-1 min-h-[44px] w-full rounded border p-2"
      maxLength={16} value={referral} onChange={e=>setReferral(e.target.value.toUpperCase())}/></label>
    <button className={button} disabled={busy} onClick={trial}>Start verified 30-day trial</button>
   </section>}
  <section className="space-y-2 rounded border p-4">
   <h2 className="font-semibold">Partner / referral programme</h2>
   {code?<p className="text-sm">Your code: <strong>{code.code}</strong> ·
    <span className="break-all"> {typeof window!=="undefined"?window.location.origin+"/register?ref="+code.code:"/register?ref="+code.code}</span></p>:
    <button className={button} disabled={busy} onClick={registerPartner}>Register partner code</button>}
   <p className="text-xs text-slate-600">10% of first verified annual subscription; test-mode commission proofs are never payable. Live commission is earned but not automatically paid out.</p>
   {commissions.map(c=><p className="text-sm" key={c.id}>
    Commission {amount(c.commission_inr)} · {c.payout_state}</p>)}
  </section>
  <section className="space-y-1 text-sm">
   <h2 className="font-semibold">Server-verified receipts</h2>
   {receipts.length===0?<p>No captured payment receipts recorded.</p>:
    receipts.map(r=><p key={r.id}>{amount(r.amount_paise/100)} · {r.environment} ·
      {new Date(r.captured_at).toLocaleString()}</p>)}
  </section>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
 </main>;
}
