"use client";

import * as React from "react";
import {configFromEnv,pgInsert,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Branch={id:string;name:string};
type Supplier={id:string;name:string};
type Product={id:string;name:string;sku:string|null;cost_price:number;branch_id:string|null};
type Po={id:string;org_id:string;branch_id:string;supplier_id:string;total:number;status:string;created_at:string};
type Pending={id:string;supplierId:string;branchId:string;productId:string;quantity:number;unitCost:number};

async function scope(){
 const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
 if(!cfg||!token||!user?.id)throw new Error("Signed-in Supabase session required.");
 const a=await resolveOnlineAuthorization(token,user.id);
 if(!a.ok)throw new Error(a.error);
 if(getOutboxScope()!==a.orgId+":"+user.id||!can("purchases.manage"))
  throw new Error("Authorized cloud purchasing manager required.");
 return {cfg:{...cfg,accessToken:token},token,userId:user.id,orgId:a.orgId};
}
function sameSession(token:string,id:string){return getSessionToken()===token&&getSessionUser()?.id===id;}

export function SaasPurchasesPanel(){
 const [branches,setBranches]=React.useState<Branch[]>([]);
 const [suppliers,setSuppliers]=React.useState<Supplier[]>([]);
 const [products,setProducts]=React.useState<Product[]>([]);
 const [orders,setOrders]=React.useState<Po[]>([]);
 const [supplierId,setSupplierId]=React.useState("");
 const [branchId,setBranchId]=React.useState("");
 const [productId,setProductId]=React.useState("");
 const [supplierName,setSupplierName]=React.useState("");
 const [quantity,setQuantity]=React.useState("1");
 const [cost,setCost]=React.useState("0");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const pending=React.useRef<Pending|null>(null);
 const pendingGrns=React.useRef<Record<string,string>>({});
 const inFlight=React.useRef(false);

 const refresh=React.useCallback(async()=>{
  const a=await scope();
  const [b,s,p,o]=await Promise.all([
   pgSelect<Branch>(a.cfg,"branches","select=id,name&org_id=eq."+a.orgId+"&deleted_at=is.null&order=name.asc&limit=100"),
   pgSelect<Supplier>(a.cfg,"suppliers","select=id,name&org_id=eq."+a.orgId+"&order=name.asc&limit=1000"),
   pgSelect<Product>(a.cfg,"products","select=id,name,sku,cost_price,branch_id&org_id=eq."+a.orgId+
      "&deleted_at=is.null&has_variants=eq.false&order=name.asc&limit=1000"),
   pgSelect<Po>(a.cfg,"saas_purchase_orders","select=*&org_id=eq."+a.orgId+"&order=created_at.desc&limit=100"),
  ]);
  if(b.error||s.error||p.error||o.error||!b.data||!s.data||!p.data||!o.data)
    throw new Error(b.error?.message||s.error?.message||p.error?.message||o.error?.message||"Cloud purchase data unavailable.");
  if(!sameSession(a.token,a.userId))throw new Error("Session changed during purchase refresh.");
  setBranches(b.data);setSuppliers(s.data);setProducts(p.data);setOrders(o.data);
  setBranchId(prev=>b.data!.some(x=>x.id===prev)?prev:(b.data![0]?.id||""));
  setSupplierId(prev=>s.data!.some(x=>x.id===prev)?prev:(s.data![0]?.id||""));
  setProductId(prev=>p.data!.some(x=>x.id===prev)?prev:(p.data![0]?.id||""));
 },[]);
 React.useEffect(()=>{let active=true;void refresh().catch(e=>{if(active)setError(String(e.message||e))});
 const listen=()=>{if(active)void refresh().catch(e=>{if(active)setError(String(e.message||e))})};
 window.addEventListener("minarva:data-hydrated",listen);
 return()=>{active=false;window.removeEventListener("minarva:data-hydrated",listen)}},[refresh]);

 async function addSupplier(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const name=supplierName.trim();
   if(!name||name.length>160)throw new Error("Supplier name must be 1–160 characters.");
   const a=await scope();const id=crypto.randomUUID();
   const result=await pgInsert<Record<string,unknown>>(a.cfg,"suppliers",{
    id,org_id:a.orgId,name,company:name,category:"general",
   });
   if(result.error)throw new Error(result.error.message);
   const confirm=await pgSelect<Supplier>(a.cfg,"suppliers","select=id,name&org_id=eq."+a.orgId+"&id=eq."+id+"&limit=2");
   if(confirm.error||confirm.data?.length!==1||confirm.data[0].name!==name)
    throw new Error("Supplier was NOT confirmed in Supabase.");
   if(!sameSession(a.token,a.userId))throw new Error("Session changed after supplier save.");
   setNotice("Supplier confirmed in Supabase.");setSupplierName("");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Supplier NOT saved.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function createPo(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   if(!pending.current){
    const q=Number(quantity),price=Number(cost);
    if(!branchId||!supplierId||!productId||!Number.isFinite(q)||q<=0||
     q>999999||Math.round(q*1000)!==q*1000||!Number.isFinite(price)||
     price<0||price>999999999||Math.round(price*100)!==price*100)
      throw new Error("Choose branch, supplier, product and valid quantity/price.");
    pending.current={id:crypto.randomUUID(),supplierId,branchId,productId,quantity:q,unitCost:price};
   }
   const p=pending.current;if(!p)throw new Error("Missing purchase draft.");
   const a=await scope();
   const receipt=await pgRpc<Record<string,unknown>>(a.cfg,"saas_create_purchase_order",{
    p_order_id:p.id,p_supplier_id:p.supplierId,p_branch_id:p.branchId,
    p_items:[{product_id:p.productId,quantity:p.quantity,unit_cost:p.unitCost}],
   });
   if(receipt.error)throw new Error(receipt.error.message);
   const [po,items]=await Promise.all([
     pgSelect<Po>(a.cfg,"saas_purchase_orders","select=*&id=eq."+p.id+"&org_id=eq."+a.orgId+"&limit=2"),
     pgSelect<Record<string,unknown>>(a.cfg,"saas_purchase_order_items","select=*&order_id=eq."+p.id+"&org_id=eq."+a.orgId+"&limit=2"),
   ]);
   if(po.error||items.error||po.data?.length!==1||items.data?.length!==1||
     po.data[0].status!=="draft"||po.data[0].supplier_id!==p.supplierId||
     Number(po.data[0].total)!==Math.round(p.quantity*p.unitCost*100)/100)
    throw new Error("PO NOT verified in Supabase; retry the SAME purchase.");
   if(!sameSession(a.token,a.userId))throw new Error("Session changed after purchase save.");
   pending.current=null;setNotice("Purchase Order verified in Supabase.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Purchase NOT verified.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function receivePo(po:Po){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const receiptId=pendingGrns.current[po.id]??=crypto.randomUUID();
   const a=await scope();
   const ack=await pgRpc<Record<string,unknown>>(a.cfg,"saas_receive_purchase_order",{
     p_receipt_id:receiptId,p_order_id:po.id,
   });
   if(ack.error)throw new Error(ack.error.message);
   const [grn,payable,order]=await Promise.all([
     pgSelect<Record<string,unknown>>(a.cfg,"saas_goods_receipts","select=id,order_id&order_id=eq."+po.id+"&org_id=eq."+a.orgId+"&limit=2"),
     pgSelect<Record<string,unknown>>(a.cfg,"saas_supplier_payables","select=order_id,total,paid&order_id=eq."+po.id+"&org_id=eq."+a.orgId+"&limit=2"),
     pgSelect<Po>(a.cfg,"saas_purchase_orders","select=*&id=eq."+po.id+"&org_id=eq."+a.orgId+"&limit=2"),
   ]);
   if(grn.error||payable.error||order.error||grn.data?.length!==1||
     payable.data?.length!==1||order.data?.length!==1||
     grn.data[0].id!==receiptId||order.data[0].status!=="received"||
     Number(payable.data[0].total)!==Number(order.data[0].total))
    throw new Error("GRN/Payable NOT confirmed; retry the SAME receipt.");
   if(!sameSession(a.token,a.userId))throw new Error("Session changed after GRN commit.");
   delete pendingGrns.current[po.id];
   setNotice("Stock and supplier payable confirmed atomically in Supabase.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"GRN NOT verified.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border bg-white p-4">
  <h2 className="text-lg font-semibold">Cloud Purchases · PO → GRN → Supplier Payable</h2>
  <p className="text-xs text-slate-500">Tenant PostgreSQL writes only. GRN receipt updates product stock and payable atomically.</p>
  <div className="flex flex-wrap gap-2">
    <input aria-label="New supplier name" value={supplierName} onChange={e=>setSupplierName(e.target.value)}
      placeholder="New supplier name" className="rounded border p-2" disabled={busy}/>
    <button type="button" className="rounded border px-3" disabled={busy} onClick={()=>{void addSupplier()}}>Add Cloud Supplier</button>
  </div>
  <div className="grid gap-2 sm:grid-cols-5">
    <label className="text-sm">Branch<select className="mt-1 w-full rounded border p-2"
      value={branchId} disabled={busy||!!pending.current} onChange={e=>setBranchId(e.target.value)}>
      {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label className="text-sm">Supplier<select className="mt-1 w-full rounded border p-2"
      value={supplierId} disabled={busy||!!pending.current} onChange={e=>setSupplierId(e.target.value)}>
      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm">Product<select className="mt-1 w-full rounded border p-2"
      value={productId} disabled={busy||!!pending.current} onChange={e=>setProductId(e.target.value)}>
      {products.filter(p=>p.branch_id===null||p.branch_id===branchId).map(p=>
        <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="text-sm">Quantity<input className="mt-1 w-full rounded border p-2" type="number"
      min="0.001" step="0.001" value={quantity} disabled={busy||!!pending.current} onChange={e=>setQuantity(e.target.value)}/></label>
    <label className="text-sm">Unit Cost<input className="mt-1 w-full rounded border p-2" type="number"
      min="0" step="0.01" value={cost} disabled={busy||!!pending.current} onChange={e=>setCost(e.target.value)}/></label>
  </div>
  <button type="button" className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
    disabled={busy||(!pending.current&&(!supplierId||!productId||!branchId))}
    onClick={()=>{void createPo()}}>{busy?"Confirming Supabase…":pending.current?"Retry same PO":"Create Cloud Purchase Order"}</button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
  <div className="space-y-2">
   {orders.map(po=><div key={po.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
     <span><strong>{po.id.slice(0,8)}</strong> · Supplier {suppliers.find(s=>s.id===po.supplier_id)?.name||po.supplier_id}
      · ₹{Number(po.total).toFixed(2)} · <strong>{po.status}</strong></span>
     {po.status==="draft"&&<button type="button" className="rounded border px-3 py-1"
       disabled={busy} onClick={()=>{void receivePo(po)}}>Receive GRN</button>}
   </div>)}
  </div>
 </section>;
}
