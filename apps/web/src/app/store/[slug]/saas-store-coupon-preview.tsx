"use client";
import * as React from "react";
import {configFromEnv,pgRpc} from "@minarvabiz/database";
type Preview={eligible:boolean;discount:number;preview_only:boolean;code?:string};
export function SaasStoreCouponPreview({slug,total}:{slug:string;total:number}){
 const [code,setCode]=React.useState("");
 const [result,setResult]=React.useState<Preview|null>(null);
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const flight=React.useRef(false);
 async function preview(){
  if(flight.current)return;
  flight.current=true;setBusy(true);setError("");setResult(null);
  try{
   const cfg=configFromEnv();
   if(!cfg||!Number.isFinite(total)||total<=0||total>150000)throw new Error("Valid cart required.");
   const c=code.trim().toUpperCase();
   if(!/^[A-Z0-9][A-Z0-9_-]{3,19}$/.test(c))throw new Error("Enter a valid promotional code.");
   const r=await pgRpc<Preview>(cfg,"saas_preview_store_coupon",{
    p_slug:slug,p_code:c,p_cart_gross:Math.round(total*100)/100});
   if(r.error||!r.data||r.data.preview_only!==true)
    throw new Error(r.error?.message||"Promo eligibility not verified.");
   setResult(r.data);
  }catch(e){setError(e instanceof Error?e.message:"Promo validation failed.");}
  finally{flight.current=false;setBusy(false);}
 }
 return <section className="space-y-2 rounded border p-3 text-sm">
  <label className="block">Promotional code (preview only)
   <input className="mt-1 min-h-[44px] w-full rounded border p-2"
    value={code} maxLength={20} onChange={e=>{setCode(e.target.value);setResult(null)}}/>
  </label>
  <button className="min-h-[44px] rounded border px-3 disabled:opacity-50" disabled={busy||total<=0}
   type="button" onClick={()=>{void preview()}}>Check promo eligibility</button>
  {result&&<p role="status">{result.eligible?
   "Eligible promotional estimate: ₹"+Number(result.discount).toFixed(2):
   "Coupon not available."}</p>}
  <p className="text-xs text-amber-700">A promotional preview is NOT deducted from the current order total. The merchant must apply a verified discount through the billing workflow.</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </section>;
}
