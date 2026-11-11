"use client";

import * as React from "react";
import { configFromEnv, pgRpc, pgSelect } from "@minarvabiz/database";
import {
  can, getOutboxScope, getSessionToken, getSessionUser, buildSaasThermal80mmReceipt,
} from "@minarvabiz/business-logic";
import { SaasCameraBarcodeScanner } from "@/components/SaasCameraBarcodeScanner";
import { resolveOnlineAuthorization } from "../../../lib/data-source";
import {useTenantIndustry} from "@/components/TenantIndustryContext";

type CloudProduct = {
  id:string; org_id:string; name:string; sku:string|null; barcode:string|null;
  stock_quantity:number; selling_price:number; cost_price:number; tax_rate:number;
  version:number; has_variants:boolean|null;
};
type VerticalMetadata = {
  product_id:string; org_id:string; industry_id:string;
  batch_number:string|null; expiry_date:string|null;
  drug_schedule:string|null; drug_formulation:string|null;
  serial_imei:string|null; warranty_months:number|null; mrp_price:number|null;
};
type PendingSale = {
  id:string; product:CloudProduct; quantity:number;
  invoice:string; gross:number; tax:number; net:number; itemId:string;
  payload:Record<string,unknown>;
};
const safeQty=(s:string)=>/^[1-9]\d*$/.test(s.trim())&&Number.isSafeInteger(Number(s))&&Number(s)<1000000;

export function SaasCloudPos() {
  const industry=useTenantIndustry();
  const currency=industry?.currency_code||"INR";
  const money=(n:number)=>new Intl.NumberFormat(industry?.language_code==="ar"?"ar-OM":"en-IN",{
    style:"currency",currency,minimumFractionDigits:currency==="OMR"?3:2,
    maximumFractionDigits:currency==="OMR"?3:2,
  }).format(n);
  const [metadata,setMetadata]=React.useState<Record<string,VerticalMetadata>>({});
  const [products,setProducts]=React.useState<CloudProduct[]>([]);
  const [productId,setProductId]=React.useState("");
  const [quantity,setQuantity]=React.useState("1");
  const [query,setQuery]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [notice,setNotice]=React.useState("");
  const [error,setError]=React.useState("");
  const [lastSale,setLastSale]=React.useState<{invoice:string;id:string;total:number;tax:number;productName:string;quantity:number;unitPrice:number}|null>(null);
  const pending=React.useRef<PendingSale|null>(null);
  const flight=React.useRef(false);

  async function context(){
    const cfg=configFromEnv(), token=getSessionToken(),user=getSessionUser();
    if(!cfg||!token||!user?.id)throw new Error("Signed-in Supabase session required.");
    const auth=await resolveOnlineAuthorization(token,user.id);
    if(!auth.ok)throw new Error(auth.error);
    if(getOutboxScope()!==auth.orgId+":"+user.id||!can("sales.create"))
      throw new Error("Verified tenant POS role required.");
    return {cfg:{...cfg,accessToken:token},token,userId:user.id,orgId:auth.orgId};
  }
  const load=React.useCallback(async()=>{
    const ctx=await context();
    const result=await pgSelect<CloudProduct>(ctx.cfg,"products",
      "select=id,org_id,name,sku,barcode,stock_quantity,selling_price,cost_price,tax_rate,version,has_variants"
      +"&org_id=eq."+ctx.orgId+"&is_active=eq.true&deleted_at=is.null&order=name.asc&limit=1000");
    if(result.error||!result.data)throw new Error("Live stock not loaded from Supabase: "+(result.error?.message||"empty response"));
    if(ctx.token!==getSessionToken()||ctx.userId!==getSessionUser()?.id)
      throw new Error("Session changed during POS refresh.");
    setProducts(result.data.filter(p=>!p.has_variants));
    if(industry?.enabled_verticals.length){
      const info=await pgSelect<VerticalMetadata>(ctx.cfg,"saas_product_vertical_details",
        "select=product_id,org_id,industry_id,batch_number,expiry_date,drug_schedule,drug_formulation,serial_imei,warranty_months,mrp_price"
        +"&org_id=eq."+ctx.orgId+"&limit=1000");
      if(info.error||!info.data)throw new Error("Industry product tracking unavailable: "+(info.error?.message||"empty response"));
      setMetadata(Object.fromEntries(info.data.map(v=>[v.product_id,v])));
    }else setMetadata({});

    setProductId(prev=>result.data?.some(p=>p.id===prev)?prev:(result.data?.[0]?.id||""));
  },[industry]);
  React.useEffect(()=>{
    let active=true;
    const refresh=()=>{if(getSessionToken())void load().catch(e=>{if(active)setError(e.message)});};
    refresh();
    window.addEventListener("minarva:data-hydrated",refresh);
    return()=>{active=false;window.removeEventListener("minarva:data-hydrated",refresh)};
  },[load]);

  async function save(){
    if(flight.current)return;
    flight.current=true;setBusy(true);setError("");setNotice("");
    try{
      if(!pending.current){
        if(!safeQty(quantity))throw new Error("Quantity must be a positive whole number.");
        const product=products.find(p=>p.id===productId);
        if(!product)throw new Error("Choose an available cloud product.");
        const qty=Number(quantity);
        if(qty>Number(product.stock_quantity))throw new Error("Insufficient cloud stock.");
        if(!industry?.primary_vertical||industry.currency_code!=="INR"||industry.country_code!=="IN"){
          throw new Error("Cloud POS currently supports only verified India/INR GST. Foreign VAT, OMR and USD billing must use a jurisdiction-specific invoice engine.");
        }
        const details=metadata[product.id];
        if(industry.enabled_verticals.length>0){
          if(!details||!industry.enabled_verticals.includes(details.industry_id as typeof industry.enabled_verticals[number])){
            throw new Error("Product is missing a verified, tenant-enabled industry profile.");
          }
          if(["pharmacy_medical","fmcg_supermarket","bakery_cafe_restaurant"].includes(details.industry_id)){
            if(!details.batch_number||!details.expiry_date)throw new Error("Batch and expiry must be recorded before billing.");
            if(details.expiry_date<new Date().toISOString().slice(0,10))throw new Error("Expired batch cannot be billed.");
          }
          if(details.industry_id==="pharmacy_medical")throw new Error(
            "Pharmacy dispensing is blocked until batch-level stock allocation and medicine-sale compliance are verified."
          );
          if(details.industry_id==="electronics_computer"&&
            (!details.serial_imei||details.warranty_months==null||qty!==1||Number(product.stock_quantity)!==1)){
            throw new Error("Serialized electronics checkout requires one uniquely tracked unit and warranty details.");
          }
        }
        const ctx=await context();
        const price=await pgRpc<Record<string,unknown>>(ctx.cfg,"saas_gst_inclusive_price",{
          p_product_id:product.id,p_quantity:qty,
        });
        if(price.error||!price.data)throw new Error(price.error?.message||"GST price RPC failed.");
        const gross=Number(price.data.total_gross);
        const tax=Number(price.data.gst_component);
        const net=Number(price.data.total_net);
        if(!Number.isFinite(gross)||gross<0||!Number.isFinite(tax)||!Number.isFinite(net)||
           Math.abs(gross-net-tax)>0.01)
          throw new Error("Cloud GST-inclusive Price calculation invalid.");
        const id=crypto.randomUUID(), itemId=crypto.randomUUID();
        const invoice="MB-CLOUD-"+id.replaceAll("-","").slice(0,16).toUpperCase();
        const payload={
          id,invoice_number:invoice,customer_id:null,customer_name:"Walk-in",
          subtotal:net,discount_amount:0,tax_amount:tax,
          total:gross,paid_amount:0,balance_amount:gross,status:"completed",
          branch_id:null,items:[{
            id:itemId,product_id:product.id,product_name:product.name,sku:product.sku,
            quantity:qty,unit_price:Number(product.selling_price),
            cost_price:Number(product.cost_price),discount_percent:0,
            tax_rate:Number(product.tax_rate||0),line_total:gross,
          }],
        };
        pending.current={id,product,quantity:qty,invoice,gross,tax,net,itemId,payload};
      }
      const p=pending.current;
      if(!p)throw new Error("No pending cloud transaction.");
      const ctx=await context();
      const commit=await pgRpc<Record<string,unknown>>(ctx.cfg,"saas_checkout_once",{
        p_mutation_id:p.id,p_sale:p.payload,p_payments:[],
      });
      if(commit.error)throw new Error(commit.error.message);
      const [sales,items,movements]=await Promise.all([
        pgSelect<Record<string,unknown>>(ctx.cfg,"sales",
          "select=id,org_id,total,paid_amount,invoice_number&id=eq."+p.id+"&org_id=eq."+ctx.orgId+"&limit=2"),
        pgSelect<Record<string,unknown>>(ctx.cfg,"sale_items",
          "select=id,sale_id,product_id,quantity&sale_id=eq."+p.id+"&org_id=eq."+ctx.orgId+"&limit=2"),
        pgSelect<Record<string,unknown>>(ctx.cfg,"inventory_transactions",
          "select=id,reference_id,product_id,quantity&reference_type=eq.sale&reference_id=eq."+p.id+
          "&org_id=eq."+ctx.orgId+"&limit=2"),
      ]);
      if(sales.error||items.error||movements.error||sales.data?.length!==1||
         items.data?.length!==1||movements.data?.length!==1||
         sales.data[0].invoice_number!==p.invoice||
         Number(sales.data[0].total)!==p.gross||
         Number(sales.data[0].paid_amount)!==0||
         items.data[0].product_id!==p.product.id||
         Number(items.data[0].quantity)!==p.quantity||
         movements.data[0].product_id!==p.product.id)
        throw new Error("Sale/stock NOT fully confirmed in Supabase. Retry the SAME checkout.");
      if(ctx.token!==getSessionToken()||ctx.userId!==getSessionUser()?.id)
        throw new Error("Session changed after checkout. Verify invoice in cloud.");
      pending.current=null;
      setLastSale({invoice:p.invoice,id:p.id,total:p.gross,tax:p.tax,productName:p.product.name,quantity:p.quantity,unitPrice:Number(p.product.selling_price)});
      setNotice("Cloud sale confirmed. Stock was deducted atomically; no gateway payment captured.");
      setQuantity("1");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Checkout NOT confirmed. Retry same invoice.");}
    finally{flight.current=false;setBusy(false);}
  }
  function printLastReceipt(){
    setError("");
    if(!lastSale) return;
    try {
      const html=buildSaasThermal80mmReceipt({
        invoice:lastSale.invoice,business:"Minarva Biz",
        printedAt:new Date().toLocaleString(),
        lines:[{name:lastSale.productName,quantity:lastSale.quantity,
          unitPrice:lastSale.unitPrice,total:lastSale.total}],
        total:lastSale.total,paid:0,balance:lastSale.total,gst:lastSale.tax,
      });
      const w=window.open("","_blank","width=400,height=730");
      if(!w){setError("Browser blocked receipt print/PDF window.");return}
      w.document.open();w.document.write(html);w.document.close();
      w.addEventListener("load",()=>{w.focus();w.print()},{once:true});
      setNotice("80mm thermal receipt preview opened. Select your printer or Save as PDF. No automatic blank feed.");
    }catch(e){setError(e instanceof Error?e.message:"Receipt preview failed.");}
  }
  const selected=products.find(p=>p.id===productId);
  const filtered=products.filter(p=>(p.name+" "+(p.sku||"")+" "+(p.barcode||"")).toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <h3 className="text-lg font-semibold">Cloud POS · {currency} billing</h3>
    <p className="text-xs text-slate-600">Atomic cloud checkout supports verified India/INR GST only. Non-INR VAT/tax, regulated pharmacy dispensing and multi-unit serial tracking are blocked, not silently treated as Indian GST.</p>
    <label className="block text-sm">Search product, SKU or barcode
      <input className="mt-1 min-h-[44px] w-full rounded border p-2" value={query} disabled={!!pending.current||busy}
        onChange={e=>setQuery(e.target.value)}/>
    </label>
    <SaasCameraBarcodeScanner label="Scan POS barcode / QR"
      disabled={busy||!!pending.current}
      onDetected={code=>{
       const match=products.find(p=>[p.barcode,p.sku,p.id].includes(code));
       setQuery(match?match.barcode||match.sku||match.id:code);
       if(match)setProductId(match.id);
      }}/>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-sm">Product
        <select className="mt-1 min-h-[44px] w-full rounded border p-2" disabled={!!pending.current||busy}
          value={productId} onChange={e=>setProductId(e.target.value)}>
          {filtered.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||p.barcode||"No SKU"}</option>)}
        </select>
      </label>
      <label className="text-sm">Quantity
        <input className="mt-1 min-h-[44px] w-full rounded border p-2" type="number" min="1" step="1"
          value={quantity} disabled={!!pending.current||busy} onChange={e=>setQuantity(e.target.value)}/>
      </label>
      <button type="button" className="self-end min-h-[44px] touch-manipulation rounded bg-slate-900 p-2 text-white disabled:opacity-50"
        disabled={busy||(!pending.current&&!selected)} onClick={()=>{void save()}}>
        {busy?"Confirming in Supabase…":pending.current?"Retry same checkout":"Save cloud sale"}
      </button>
    </div>
    {selected&&<div className="space-y-1 text-sm">
      <p>Available stock: {Number(selected.stock_quantity)}
        · Price: {money(Number(selected.selling_price))}
        · Tax configured on product: {Number(selected.tax_rate||0)}%</p>
      {metadata[selected.id]&&<p className="text-xs text-slate-600" aria-label="Verified product tracking">
        {metadata[selected.id].batch_number&&`Batch: ${metadata[selected.id].batch_number} · `}
        {metadata[selected.id].expiry_date&&`Expiry: ${metadata[selected.id].expiry_date} · `}
        {metadata[selected.id].serial_imei&&`Serial / IMEI: ${metadata[selected.id].serial_imei} · `}
        {metadata[selected.id].warranty_months!=null&&`Warranty: ${metadata[selected.id].warranty_months} months`}
      </p>}
    </div>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
    {lastSale&&<p className="text-sm">Confirmed invoice: <strong>{lastSale.invoice}</strong>
      · {money(lastSale.total)} · Cloud receipt {lastSale.id}
      <button type="button" className="ml-3 rounded border px-2 py-1"
        onClick={printLastReceipt}>Print 80mm / Save PDF</button></p>}
  </section>;
}
