"use client";

import * as React from "react";
import {configFromEnv,pgRpc,pgSelect} from "@minarvabiz/database";
import {can,getOutboxScope,getSessionToken,getSessionUser} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";

type Branch={id:string;name:string};
type Product={id:string;name:string;stock_quantity:number;version:number;branch_id:string|null};
type Stock={product_id:string;branch_id:string;quantity:number};
type Transfer={id:string;product_id:string;source_branch_id:string;destination_branch_id:string;quantity:number;created_at:string};
type SeedRequest={id:string;productId:string;branchId:string;version:number};
type TransferRequest={id:string;productId:string;sourceId:string;destinationId:string;qty:number};
async function authorizedContext(){
 const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
 if(!cfg||!token||!user?.id)throw new Error("Cloud sign-in required.");
 const a=await resolveOnlineAuthorization(token,user.id);
 if(!a.ok)throw new Error(a.error);
 if(getOutboxScope()!==a.orgId+":"+user.id||!can("inventory.adjust"))
  throw new Error("Inventory manager authorization required.");
 return {cfg:{...cfg,accessToken:token},token,userId:user.id,org:a.orgId};
}
function stillSigned(token:string,userId:string){
 if(getSessionToken()!==token||getSessionUser()?.id!==userId)
  throw new Error("Account changed. Reload and sign in again.");
}

export function SaasBranchTransferPanel(){
 const [products,setProducts]=React.useState<Product[]>([]);
 const [branches,setBranches]=React.useState<Branch[]>([]);
 const [stock,setStock]=React.useState<Stock[]>([]);
 const [transfers,setTransfers]=React.useState<Transfer[]>([]);
 const [productId,setProductId]=React.useState("");
 const [source,setSource]=React.useState("");
 const [destination,setDestination]=React.useState("");
 const [qty,setQty]=React.useState("1");
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const inFlight=React.useRef(false);
 const seed=React.useRef<SeedRequest|null>(null);
 const transfer=React.useRef<TransferRequest|null>(null);

 const refresh=React.useCallback(async()=>{
  const a=await authorizedContext();
  const [p,b,s,t]=await Promise.all([
   pgSelect<Product>(a.cfg,"products",
    "select=id,name,stock_quantity,version,branch_id&org_id=eq."+a.org+
    "&deleted_at=is.null&is_active=eq.true&has_variants=eq.false&order=name.asc&limit=500"),
   pgSelect<Branch>(a.cfg,"branches",
    "select=id,name&org_id=eq."+a.org+"&deleted_at=is.null&is_active=eq.true&order=name.asc&limit=100"),
   pgSelect<Stock>(a.cfg,"saas_branch_stock",
    "select=product_id,branch_id,quantity&org_id=eq."+a.org+"&limit=1500"),
   pgSelect<Transfer>(a.cfg,"saas_branch_stock_transfers",
    "select=id,product_id,source_branch_id,destination_branch_id,quantity,created_at&org_id=eq."+
     a.org+"&order=created_at.desc&limit=100")
  ]);
  if(p.error||b.error||s.error||t.error||!p.data||!b.data||!s.data||!t.data)
   throw new Error(p.error?.message||b.error?.message||s.error?.message||t.error?.message||"Cloud branch stock unavailable.");
  stillSigned(a.token,a.userId);
  setProducts(p.data);setBranches(b.data);setStock(s.data);setTransfers(t.data);
  setProductId(prev=>p.data?.some(x=>x.id===prev)?prev:(p.data?.[0]?.id||""));
  setSource(prev=>b.data?.some(x=>x.id===prev)?prev:(b.data?.[0]?.id||""));
  setDestination(prev=>b.data?.some(x=>x.id===prev)?prev:(b.data?.[1]?.id||""));
 },[]);
 React.useEffect(()=>{
  let active=true;
  void refresh().catch(e=>{if(active)setError(String(e?.message||e));});
  return()=>{active=false};
 },[refresh]);
 const current=products.find(p=>p.id===productId);
 const allocated=stock.filter(s=>s.product_id===productId);
 const allocatedTotal=allocated.reduce((sum,p)=>sum+Number(p.quantity),0);
 const initial=allocated.length===0;
 const branchName=(id:string)=>branches.find(b=>b.id===id)?.name||id.slice(0,8);
 async function initialize(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   if(!current||!source)throw new Error("Select a product and opening branch.");
   seed.current??={id:crypto.randomUUID(),productId:current.id,branchId:source,version:current.version};
   const req=seed.current;
   const a=await authorizedContext();
   const r=await pgRpc<{seed_id:string;quantity:number}>(a.cfg,
    "saas_initialize_branch_stock_once",{
      p_seed_id:req.id,p_product_id:req.productId,
      p_branch_id:req.branchId,p_expected_version:req.version,
    });
   if(r.error||r.data?.seed_id!==req.id)
    throw new Error(r.error?.message||"Opening allocation not confirmed; retry same ID.");
   const confirmation=await pgSelect<{id:string;product_id:string;branch_id:string;quantity:number}>(
    a.cfg,"saas_branch_stock_seeds","select=id,product_id,branch_id,quantity&id=eq."+req.id+"&org_id=eq."+a.org+"&limit=2");
   if(confirmation.error||confirmation.data?.length!==1||
    confirmation.data[0].product_id!==req.productId||confirmation.data[0].branch_id!==req.branchId)
    throw new Error("Opening stock not confirmed on server; retry same ID.");
   stillSigned(a.token,a.userId);
   seed.current=null;
   await refresh();
   setNotice("Branch allocation confirmed in Supabase. Global product stock unchanged.");
  }catch(e){setError(e instanceof Error?e.message:"Branch allocation not verified.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function move(){
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const parsed=Number(qty);
   if(!current||!source||!destination||source===destination||
     !Number.isFinite(parsed)||parsed<=0||parsed>9999999||
     Math.abs(parsed*1000-Math.round(parsed*1000))>1e-7)
     throw new Error("Select two different branches and a positive quantity (3 decimals maximum).");
   transfer.current??={id:crypto.randomUUID(),productId:current.id,
    sourceId:source,destinationId:destination,qty:parsed};
   const req=transfer.current;
   const a=await authorizedContext();
   const result=await pgRpc<{transfer_id:string;quantity:number}>(a.cfg,
    "saas_transfer_branch_stock_once",{
      p_transfer_id:req.id,p_product_id:req.productId,p_source_branch_id:req.sourceId,
      p_destination_branch_id:req.destinationId,p_quantity:req.qty,
    });
   if(result.error||result.data?.transfer_id!==req.id)
    throw new Error(result.error?.message||"Transfer not confirmed; retry same ID.");
   const [receipt,movements]=await Promise.all([
    pgSelect<{id:string;quantity:number}>(a.cfg,"saas_branch_stock_transfers",
      "select=id,quantity&id=eq."+req.id+"&org_id=eq."+a.org+"&limit=2"),
    pgSelect<{event_id:string;quantity_delta:number}>(a.cfg,"saas_branch_stock_movements",
      "select=event_id,quantity_delta&event_id=eq."+req.id+"&org_id=eq."+a.org+"&limit=3")
   ]);
   if(receipt.error||movements.error||receipt.data?.length!==1||
    movements.data?.length!==2||
    movements.data.reduce((s,m)=>s+Number(m.quantity_delta),0)!==0)
    throw new Error("Both stock movements NOT confirmed; retry same transfer ID.");
   stillSigned(a.token,a.userId);
   transfer.current=null;
   await refresh();
   setNotice("Transfer committed atomically, including two balancing ledger entries.");
  }catch(e){setError(e instanceof Error?e.message:"Transfer not verified.");}
  finally{inFlight.current=false;setBusy(false);}
 }
 const pending=!!seed.current||!!transfer.current;
 return <main className="space-y-4 rounded-xl border bg-white p-4">
  <h1 className="text-xl font-semibold">Cloud Branch Stock Transfers</h1>
  <p className="text-xs text-slate-600">Tenant-scoped, replay-safe branch transfer. Branch allocation must equal global product stock; after POS/GRN adjustments, reconcile before further transfers. Warehouse-bin operations are a separate workflow.</p>
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-sm">Product<select className="mt-1 w-full rounded border p-2"
    disabled={busy||pending} value={productId} onChange={e=>setProductId(e.target.value)}>
    {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
   <label className="text-sm">From branch<select className="mt-1 w-full rounded border p-2"
    disabled={busy||pending} value={source} onChange={e=>setSource(e.target.value)}>
    {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
   </select></label>
   <label className="text-sm">To branch<select className="mt-1 w-full rounded border p-2"
    disabled={busy||pending} value={destination} onChange={e=>setDestination(e.target.value)}>
    {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
   </select></label>
  </div>
  <p className="text-sm">Global stock: <strong>{Number(current?.stock_quantity||0)}</strong>
  {" · "}Allocated: <strong>{allocatedTotal}</strong>
  {" · "}{initial?"Opening allocation required":allocatedTotal===Number(current?.stock_quantity)?"Reconciled":"Reconciliation required before transfer"}</p>
  {initial?<button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
    disabled={busy||!current} type="button" onClick={()=>{void initialize()}}>
    {busy?"Initializing…":seed.current?"Retry opening allocation":"Initialize selected product at source branch"}
   </button>:<div className="flex flex-wrap items-end gap-3">
    <label className="text-sm">Transfer quantity<input className="mt-1 block w-36 rounded border p-2"
     type="number" min="0.001" step="0.001" value={qty} disabled={busy||pending}
     onChange={e=>setQty(e.target.value)}/></label>
    <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
     disabled={busy||!current||allocatedTotal!==Number(current.stock_quantity)}
     type="button" onClick={()=>{void move()}}>
     {busy?"Transferring…":transfer.current?"Retry same transfer":"Transfer stock"}
    </button>
   </div>}
  <div className="space-y-1 text-sm">{allocated.map(s=><p key={s.branch_id}>
   {branchName(s.branch_id)}: <strong>{Number(s.quantity)}</strong></p>)}</div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
  <h2 className="font-semibold">Recent durable transfers</h2>
  {transfers.slice(0,20).map(t=><p key={t.id} className="border-b py-1 text-xs">
   {t.id.slice(0,8)} · {branchName(t.source_branch_id)} → {branchName(t.destination_branch_id)}
   {" · "}{Number(t.quantity)} · {new Date(t.created_at).toLocaleString()}
  </p>)}
 </main>;
}
