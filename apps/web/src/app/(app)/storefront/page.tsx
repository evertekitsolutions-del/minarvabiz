"use client";

import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";
import {MarketingLeads} from "./marketing-leads";
import {SaasStorefrontDesignPanel} from "./saas-storefront-design-panel";
import {SaasOrderFulfillmentPanel} from "./saas-order-fulfillment-panel";
import {SaasMarketingCampaignPanel} from "./saas-marketing-campaign-panel";

type Product={id:string;name:string;sku:string|null;selling_price:number};
type Store={id:string;org_id:string;slug:string;title:string;published:boolean;seo_title:string;seo_description:string;banner_url:string;accent_color:string};
type Listing={id:string;product_id:string;active:boolean};
type DraftOrder={id:string;buyer_name:string;buyer_phone:string;total:number;status:string;created_at:string};
export default function StorefrontOwnerPage(){
 const [products,setProducts]=React.useState<Product[]>([]);
 const [selected,setSelected]=React.useState<Record<string,boolean>>({});
 const [store,setStore]=React.useState<Store|null>(null);
 const [orders,setOrders]=React.useState<DraftOrder[]>([]);
 const [slug,setSlug]=React.useState("");
 const [title,setTitle]=React.useState("");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const pendingStoreId=React.useRef<string|null>(null);
 const inFlight=React.useRef(false);
 async function context(){
  const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!cfg||!token||!user?.id)throw new Error("Cloud sign-in required.");
  const a=await resolveOnlineAuthorization(token,user.id);
  if(!a.ok)throw new Error(a.error);
  if(getOutboxScope()!==a.orgId+":"+user.id||!can("products.manage"))
   throw new Error("Tenant catalog administrator required.");
  return {cfg:{...cfg,accessToken:token},token,user:user.id,org:a.orgId};
 }
 const refresh=React.useCallback(async()=>{
  const a=await context();
  const [prods,stores]=await Promise.all([
    pgSelect<Product>(a.cfg,"products","select=id,name,sku,selling_price&org_id=eq."+a.org+
      "&deleted_at=is.null&is_active=eq.true&has_variants=eq.false&order=name.asc&limit=1000"),
    pgSelect<Store>(a.cfg,"saas_storefronts","select=*&org_id=eq."+a.org+"&limit=2"),
  ]);
  if(prods.error||stores.error||!prods.data||!stores.data)
   throw new Error(prods.error?.message||stores.error?.message||"Cloud storefront data unavailable.");
  const current=stores.data[0]||null;
  const [listed,ordered]=await Promise.all([
    current?pgSelect<Listing>(a.cfg,"saas_storefront_listings",
     "select=id,product_id,active&storefront_id=eq."+current.id+"&org_id=eq."+a.org+"&limit=1000"):Promise.resolve({data:[] as Listing[],error:null}),
    pgSelect<DraftOrder>(a.cfg,"saas_storefront_draft_orders",
     "select=id,buyer_name,buyer_phone,total,status,created_at&org_id=eq."+a.org+"&order=created_at.desc&limit=100"),
  ]);
  if(listed.error||ordered.error||!ordered.data||!listed.data)
    throw new Error(listed.error?.message||ordered.error?.message||"Storefront receipts unavailable.");
  if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
    throw new Error("Account switched during store refresh.");
  setProducts(prods.data);setStore(current);setOrders(ordered.data);
  if(current){pendingStoreId.current=current.id;setSlug(current.slug);setTitle(current.title);}
  setSelected(Object.fromEntries(listed.data.filter(l=>l.active).map(x=>[x.product_id,true])));
 },[]);
 React.useEffect(()=>{let active=true;void refresh().catch(e=>{if(active)setError(String(e.message||e))});return()=>{active=false};},[refresh]);
 async function publish(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const productIds=Object.entries(selected).filter(([,v])=>v).map(([id])=>id);
   if(productIds.length<1||productIds.length>1000)throw new Error("Select 1–1000 products.");
   if(!/^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/.test(slug)||
      !title.trim()||title.length>120)throw new Error("Invalid URL slug or store title.");
   pendingStoreId.current??=crypto.randomUUID();
   const id=pendingStoreId.current;
   const a=await context();
   const result=await pgRpc<Record<string,unknown>>(a.cfg,"saas_publish_storefront",{
    p_store_id:id,p_slug:slug.trim(),p_title:title.trim(),p_product_ids:productIds,
   });
   if(result.error)throw new Error(result.error.message);
   const [stores,items]=await Promise.all([
    pgSelect<Store>(a.cfg,"saas_storefronts","select=*&id=eq."+id+"&org_id=eq."+a.org+"&limit=2"),
    pgSelect<Listing>(a.cfg,"saas_storefront_listings","select=id,product_id,active&storefront_id=eq."+id+
      "&org_id=eq."+a.org+"&active=eq.true&limit=1001"),
   ]);
   if(stores.error||items.error||stores.data?.length!==1||
     !stores.data[0].published||stores.data[0].slug!==slug||
     items.data?.length!==productIds.length)
     throw new Error("Public store NOT confirmed in Supabase. Retry same ID.");
   if(a.token!==getSessionToken()||a.user!==getSessionUser()?.id)
     throw new Error("Account changed during storefront publish.");
   setNotice("Store published and listings confirmed in tenant Supabase.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Store NOT published.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <main className="space-y-4 rounded-xl border bg-white p-4">
  <h1 className="text-xl font-bold">My SaaS Storefront</h1>
  <p className="text-xs text-slate-600">Explicitly publish tenant products; anonymous buyers submit pending ERP orders. No payment is captured.</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <label className="text-sm">Store URL slug
    <input className="mt-1 w-full rounded border p-2" value={slug} onChange={e=>setSlug(e.target.value)}
     placeholder="my-store" disabled={busy}/>
   </label>
   <label className="text-sm">Store title
    <input className="mt-1 w-full rounded border p-2" value={title} onChange={e=>setTitle(e.target.value)}
     disabled={busy}/>
   </label>
  </div>
  <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
   {products.map(p=><label key={p.id} className="flex gap-2 rounded border p-2 text-sm">
    <input type="checkbox" checked={!!selected[p.id]} disabled={busy}
      onChange={e=>setSelected(prev=>({...prev,[p.id]:e.target.checked}))}/>
    <span>{p.name} · Price ₹{Number(p.selling_price).toFixed(2)}</span>
   </label>)}
  </div>
  <button type="button" disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-white"
    onClick={()=>{void publish()}}>{busy?"Publishing in Supabase…":"Publish / Update Store"}</button>
  {store?.published&&<p className="text-sm">Public store: <a className="underline"
    href={"/store/"+encodeURIComponent(store.slug)} target="_blank" rel="noreferrer">
    /store/{store.slug}</a></p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
  <SaasStorefrontDesignPanel store={store}/>
  <SaasMarketingCampaignPanel store={store}/>
  <SaasOrderFulfillmentPanel orders={orders} onChanged={()=>{void refresh()}}/>
  <h2 className="font-semibold">Incoming ERP draft orders ({orders.length})</h2>
  <div className="space-y-1">
   {orders.map(o=><div className="rounded border p-2 text-sm" key={o.id}>
      {o.id.slice(0,8)} · {o.buyer_name} · ₹{Number(o.total).toFixed(2)}
      · {o.status} · {new Date(o.created_at).toLocaleString()}
    </div>)}
  </div>
 </main>;
}
