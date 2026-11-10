"use client";

import * as React from "react";
import {useParams} from "next/navigation";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {LeadCapture} from "./lead-capture";

type Store={id:string;title:string;slug:string;published:boolean;seo_title:string;seo_description:string;banner_url:string;accent_color:string};
type Listing={id:string;product_id:string;name:string;sku:string|null;price:number;variant_parent_id:string|null;variant_parent_name:string|null;variant_size:string|null;variant_color:string|null;variant_fabric:string|null};
type Pending={id:string;slug:string;name:string;phone:string;
 items:{product_id:string;quantity:number}[]};

export default function PublicTenantStorePage(){
 const params=useParams<{slug:string}>();
 const slug=String(params?.slug||"").trim();
 const [store,setStore]=React.useState<Store|null>(null);
 const [listings,setListings]=React.useState<Listing[]>([]);
 const [cart,setCart]=React.useState<Record<string,number>>({});
 const [variantChoice,setVariantChoice]=React.useState<Record<string,string>>({});
 const [name,setName]=React.useState("");
 const [phone,setPhone]=React.useState("");
 const [loading,setLoading]=React.useState(true);
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [success,setSuccess]=React.useState("");
 const pending=React.useRef<Pending|null>(null);
 const inFlight=React.useRef(false);
 React.useEffect(()=>{
  let active=true;
  async function load(){
    if(!/^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/.test(slug))
      throw new Error("Unknown store address.");
    const cfg=configFromEnv();
    if(!cfg)throw new Error("Store service is not configured.");
    const found=await pgSelect<Store>(cfg,"saas_storefronts",
       "select=id,title,slug,published,seo_title,seo_description,banner_url,accent_color&slug=eq."+slug+"&published=eq.true&limit=2");
    if(found.error||found.data?.length!==1)throw new Error("Store is not published.");
    const shop=found.data[0];
    const items=await pgSelect<Listing>(cfg,"saas_storefront_listings",
       "select=id,product_id,name,sku,price,variant_parent_id,variant_parent_name,variant_size,variant_color,variant_fabric&storefront_id=eq."+shop.id+"&active=eq.true&order=name.asc&limit=300");
    if(items.error||!items.data)throw new Error("Public store catalog unavailable.");
    if(active){setStore(shop);setListings(items.data);setLoading(false);}
  }
  void load().catch(e=>{if(active){setLoading(false);setError(e instanceof Error?e.message:"Store unavailable.")}});
  return()=>{active=false};
 },[slug]);
 const groups=React.useMemo(()=>{
  const m=new Map<string,Listing[]>();
  for(const item of listings){
   const key=item.variant_parent_id||item.product_id;
   const previous=m.get(key)||[];
   previous.push(item);m.set(key,previous);
  }
  return Array.from(m,([id,variants])=>({id,name:variants[0].variant_parent_name||variants[0].name,variants}));
 },[listings]);
 function selectVariant(group:{id:string;variants:Listing[]},field:"variant_size"|"variant_color"|"variant_fabric",value:string){
  const current=group.variants.find(v=>v.product_id===variantChoice[group.id])||group.variants[0];
  const same=group.variants.find(v=>(v[field]||"")===value &&
   ["variant_size","variant_color","variant_fabric"].every(k=>k===field||v[k as typeof field]===current[k as typeof field]));
  const preferred=same||group.variants.find(v=>(v[field]||"")===value);
  if(preferred)setVariantChoice(old=>({...old,[group.id]:preferred.product_id}));
 }
 const basket=listings.filter(p=>cart[p.product_id]>0).map(p=>({...p,qty:cart[p.product_id]}));
 const total=basket.reduce((s,p)=>s+p.qty*Number(p.price),0);
 async function checkout(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setSuccess("");
  try{
    if(!store)throw new Error("Store not available.");
    if(!pending.current){
      const buyerName=name.trim(),buyerPhone=phone.trim();
      if(!buyerName||buyerName.length>120||!/^\+?[0-9]{10,15}$/.test(buyerPhone)
       ||basket.length<1||basket.length>30)
       throw new Error("Provide a name, 10–15 digit phone, and a valid cart.");
      pending.current={id:crypto.randomUUID(),slug:store.slug,name:buyerName,phone:buyerPhone,
       items:basket.map(x=>({product_id:x.product_id,quantity:x.qty}))};
    }
    const p=pending.current;if(!p)throw new Error("No pending online order.");
    const cfg=configFromEnv();
    if(!cfg)throw new Error("Store API unavailable.");
    const receipt=await pgRpc<Record<string,unknown>>(cfg,"saas_storefront_checkout_reserved",{
      p_order_id:p.id,p_slug:p.slug,p_buyer_name:p.name,
      p_buyer_phone:p.phone,p_items:p.items,
    });
    if(receipt.error||receipt.data?.order_id!==p.id||(receipt.data?.status!=="pending_review"||receipt.data?.reservation_status!=="held"))
      throw new Error(receipt.error?.message||"Order receipt not confirmed. Retry same order.");
    const expires=String(receipt.data?.reservation_expires_at||"");
    if(!Number.isFinite(Date.parse(expires)))throw new Error("Stock reservation expiry not confirmed; retry same order.");
    setSuccess("Order "+p.id+" saved in "+store.title+". Stock held until "+new Date(expires).toLocaleTimeString()+". Pending staff confirmation; no money charged.");
    pending.current=null;setCart({});setName("");setPhone("");
  }catch(e){setError(e instanceof Error?e.message:"Order was not confirmed.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 function change(id:string,delta:number){
   if(pending.current||busy)return;
   setCart(prev=>{const n=Math.max(0,Math.min(20,(prev[id]||0)+delta));return {...prev,[id]:n};});
 }
 if(loading)return <main className="mx-auto max-w-4xl p-6">Loading public store…</main>;
 if(!store)return <main className="mx-auto max-w-4xl p-6" role="alert">{error||"Store unavailable."}</main>;
 return <main className="mx-auto max-w-5xl space-y-6 p-5">
   <header className="space-y-2 border-b pb-3" style={{borderColor:store.accent_color||"#1760e6"}}>
    <h1 className="text-2xl font-bold">{store.title}</h1>
    {store.banner_url&&<img src={store.banner_url} alt={store.title+" banner"}
      className="max-h-44 w-full rounded object-cover" loading="lazy" referrerPolicy="no-referrer"/>}
    {store.seo_description&&<p className="text-sm text-slate-600">{store.seo_description}</p>}
    <p className="text-sm text-slate-600">Verified product catalogue · GST-inclusive Price · orders subject to confirmation</p>
   </header>
   <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {groups.map(group=>{
     const p=group.variants.find(v=>v.product_id===variantChoice[group.id])||group.variants[0];
     return <article key={group.id} className="space-y-2 rounded-lg border p-4">
      <h2 className="font-semibold">{group.name}</h2>
      {group.variants.length>1&&<div className="grid grid-cols-3 gap-2">
       {([["variant_size","Size"],["variant_color","Color"],["variant_fabric","Fabric"]] as const).map(([field,label])=>
        <label key={field} className="text-xs">{label}
         <select className="mt-1 min-h-[44px] w-full rounded border p-1 text-xs"
          value={p[field]||""} disabled={busy||!!pending.current}
          onChange={e=>selectVariant(group,field,e.target.value)}>
          {Array.from(new Set(group.variants.map(v=>v[field]||""))).map(value=>
           <option key={value} value={value}>{value||"Default"}</option>)}
         </select></label>)}
      </div>}
      {p.sku&&<p className="text-xs text-slate-500">SKU {p.sku}</p>}
      <p className="font-semibold">Price ₹{Number(p.price).toFixed(2)}</p>
      <div className="flex items-center gap-3">
       <button className="min-h-[44px] min-w-[44px] rounded border disabled:opacity-50"
        type="button" disabled={busy||!!pending.current}
        onClick={()=>change(p.product_id,-1)}>−</button>
       <span>{cart[p.product_id]||0}</span>
       <button className="min-h-[44px] min-w-[44px] rounded border disabled:opacity-50"
        type="button" disabled={busy||!!pending.current}
        onClick={()=>change(p.product_id,1)}>+</button>
      </div>
     </article>
    })}
   </section>
   <section className="rounded-lg border p-4">
     <h2 className="text-lg font-semibold">Order summary</h2>
     <p className="text-sm">{basket.length} products · Total ₹{total.toFixed(2)} (GST included)</p>
     <p className="mb-3 text-xs text-slate-600">This saves an ERP draft order with a temporary 15-minute stock hold. Delivery charges and payment require merchant confirmation. No payment is collected here.</p>
     <div className="grid gap-2 sm:grid-cols-3">
       <label className="text-sm">Buyer name
         <input className="mt-1 w-full rounded border p-2" value={name} disabled={busy||!!pending.current}
           onChange={e=>setName(e.target.value)} autoComplete="name"/>
       </label>
       <label className="text-sm">Phone
         <input className="mt-1 w-full rounded border p-2" value={phone} disabled={busy||!!pending.current}
           onChange={e=>setPhone(e.target.value)} autoComplete="tel"/>
       </label>
       <button className="self-end rounded bg-slate-900 p-2 text-white disabled:opacity-50"
         disabled={busy||(!pending.current&&basket.length===0)} onClick={()=>{void checkout()}} type="button">
         {busy?"Confirming Supabase…":pending.current?"Retry same order":"Submit order (no payment)"}
       </button>
     </div>
     {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
     {success&&<p role="status" className="mt-2 text-green-700">{success}</p>}
   </section>
 </main>;
}
