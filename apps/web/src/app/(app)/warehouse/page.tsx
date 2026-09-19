"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import {
  store,
  listWarehouses,
  listWarehouseBins,
  listBinStocks,
  listWarehouseTransfers,
  createWarehouse,
  createWarehouseBin,
  allocateStockToBin,
  requestWarehouseTransfer,
  approveWarehouseTransfer,
  dispatchWarehouseTransfer,
  completeWarehouseTransfer,
  cancelWarehouseTransfer,
  unallocatedQuantity,
  warehouseSummary,
} from "@minarvabiz/business-logic";

export default function WarehousePage() {
  const [tick,setTick]=React.useState(0);
  const [message,setMessage]=React.useState<{ok:boolean;text:string}|null>(null);
  const [warehouseForm,setWarehouseForm]=React.useState({name:"",code:"",address:""});
  const [binForm,setBinForm]=React.useState({warehouseId:"",code:"",name:"",zone:"",aisle:"",rack:"",shelf:""});
  const [allocation,setAllocation]=React.useState({productId:"",binId:"",quantity:""});
  const [transfer,setTransfer]=React.useState({productId:"",sourceBinId:"",destinationBinId:"",quantity:"",notes:""});

  const warehouses=React.useMemo(()=>listWarehouses(),[tick]);
  const bins=React.useMemo(()=>listWarehouseBins(),[tick]);
  const stocks=React.useMemo(()=>listBinStocks(),[tick]);
  const transfers=React.useMemo(()=>listWarehouseTransfers(),[tick]);
  const products=React.useMemo(()=>store.listProducts(),[tick]);
  const summary=React.useMemo(()=>warehouseSummary(),[tick]);
  const refresh=()=>setTick(v=>v+1);
  const run=(fn:()=>void)=>{try{fn();setMessage({ok:true,text:"Saved"});refresh();}catch(e){setMessage({ok:false,text:e instanceof Error?e.message:String(e)});}};

  const binLabel=(id:string)=>{const b=bins.find(x=>x.id===id);const w=b?warehouses.find(x=>x.id===b.warehouseId):null;return b?`${w?.code||"WH"} / ${b.code}`:"—";};
  const productName=(id:string)=>products.find(p=>p.id===id)?.name||"Unknown product";

  return <div className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold text-slate-900">Warehouse / WMS</h2>
      <p className="mt-1 text-sm text-slate-500">Physical locations, bin allocation, reservation and approved stock transfers.</p>
    </div>
    {message&&<div className={`rounded-lg px-3 py-2 text-sm ${message.ok?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700"}`}>{message.text}</div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Warehouses",summary.warehouses],
        ["Bins",summary.bins],
        ["Allocated units",summary.allocatedUnits],
        ["Reserved units",summary.reservedUnits],
        ["Open transfers",summary.pendingTransfers],
      ].map(([label,value])=><Card key={String(label)}><CardContent className="p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></CardContent></Card>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Create warehouse</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name"><input className={inputClass} value={warehouseForm.name} onChange={e=>setWarehouseForm({...warehouseForm,name:e.target.value})}/></FormField>
        <FormField label="Code"><input className={inputClass} value={warehouseForm.code} onChange={e=>setWarehouseForm({...warehouseForm,code:e.target.value})} placeholder="MAIN"/></FormField>
        <FormField label="Address"><input className={inputClass} value={warehouseForm.address} onChange={e=>setWarehouseForm({...warehouseForm,address:e.target.value})}/></FormField>
        <div className="flex items-end"><Button onClick={()=>run(()=>{createWarehouse({name:warehouseForm.name,code:warehouseForm.code,address:warehouseForm.address||null});setWarehouseForm({name:"",code:"",address:""});})}>Add warehouse</Button></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Create storage bin</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <FormField label="Warehouse"><select className={selectClass} value={binForm.warehouseId} onChange={e=>setBinForm({...binForm,warehouseId:e.target.value})}><option value="">Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></FormField>
        <FormField label="Bin code"><input className={inputClass} value={binForm.code} onChange={e=>setBinForm({...binForm,code:e.target.value})} placeholder="A-01-01"/></FormField>
        <FormField label="Name"><input className={inputClass} value={binForm.name} onChange={e=>setBinForm({...binForm,name:e.target.value})}/></FormField>
        <FormField label="Zone"><input className={inputClass} value={binForm.zone} onChange={e=>setBinForm({...binForm,zone:e.target.value})}/></FormField>
        <FormField label="Aisle / Rack / Shelf"><input className={inputClass} value={[binForm.aisle,binForm.rack,binForm.shelf].filter(Boolean).join(" / ")} onChange={e=>{const [aisle="",rack="",shelf=""]=e.target.value.split("/").map(x=>x.trim());setBinForm({...binForm,aisle,rack,shelf});}} placeholder="A / R1 / S1"/></FormField>
        <div className="flex items-end"><Button onClick={()=>run(()=>{createWarehouseBin({...binForm});setBinForm({warehouseId:"",code:"",name:"",zone:"",aisle:"",rack:"",shelf:""});})}>Add bin</Button></div>
      </CardContent></Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Allocate existing stock to bin</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <FormField label="Product"><select className={selectClass} value={allocation.productId} onChange={e=>setAllocation({...allocation,productId:e.target.value})}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · unallocated {unallocatedQuantity(p.id)}</option>)}</select></FormField>
        <FormField label="Bin"><select className={selectClass} value={allocation.binId} onChange={e=>setAllocation({...allocation,binId:e.target.value})}><option value="">Select bin</option>{bins.map(b=><option key={b.id} value={b.id}>{binLabel(b.id)}</option>)}</select></FormField>
        <FormField label="Quantity"><input className={inputClass} type="number" min="0" step="0.001" value={allocation.quantity} onChange={e=>setAllocation({...allocation,quantity:e.target.value})}/></FormField>
        <div className="flex items-end"><Button onClick={()=>run(()=>{allocateStockToBin({productId:allocation.productId,binId:allocation.binId,quantity:Number(allocation.quantity)});setAllocation({productId:"",binId:"",quantity:""});})}>Allocate stock</Button></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Request bin transfer</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <FormField label="Product"><select className={selectClass} value={transfer.productId} onChange={e=>setTransfer({...transfer,productId:e.target.value})}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
        <FormField label="Source bin"><select className={selectClass} value={transfer.sourceBinId} onChange={e=>setTransfer({...transfer,sourceBinId:e.target.value})}><option value="">Select source</option>{bins.map(b=><option key={b.id} value={b.id}>{binLabel(b.id)}</option>)}</select></FormField>
        <FormField label="Destination bin"><select className={selectClass} value={transfer.destinationBinId} onChange={e=>setTransfer({...transfer,destinationBinId:e.target.value})}><option value="">Select destination</option>{bins.map(b=><option key={b.id} value={b.id}>{binLabel(b.id)}</option>)}</select></FormField>
        <FormField label="Quantity"><input className={inputClass} type="number" min="0" step="0.001" value={transfer.quantity} onChange={e=>setTransfer({...transfer,quantity:e.target.value})}/></FormField>
        <FormField label="Notes"><input className={inputClass} value={transfer.notes} onChange={e=>setTransfer({...transfer,notes:e.target.value})}/></FormField>
        <div className="flex items-end"><Button onClick={()=>run(()=>{requestWarehouseTransfer({productId:transfer.productId,sourceBinId:transfer.sourceBinId,destinationBinId:transfer.destinationBinId,quantity:Number(transfer.quantity),notes:transfer.notes||null});setTransfer({productId:"",sourceBinId:"",destinationBinId:"",quantity:"",notes:""});})}>Request transfer</Button></div>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="text-base">Bin stock</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-4 py-2">Location</th><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Reserved</th><th className="px-4 py-2 text-right">Available</th></tr></thead><tbody>{stocks.length===0?<tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No bin allocation yet</td></tr>:stocks.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-2">{binLabel(s.binId)}</td><td className="px-4 py-2 font-medium">{productName(s.productId)}</td><td className="px-4 py-2 text-right">{s.quantity}</td><td className="px-4 py-2 text-right">{s.reservedQuantity}</td><td className="px-4 py-2 text-right">{Math.max(0,s.quantity-s.reservedQuantity)}</td></tr>)}</tbody></table></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Transfer approval queue</CardTitle></CardHeader><CardContent className="space-y-2">
      {transfers.length===0&&<p className="text-sm text-slate-400">No transfers yet</p>}
      {transfers.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><div><div className="font-semibold">{t.transferNumber} · {productName(t.productId)}</div><div className="text-slate-500">{binLabel(t.sourceBinId)} → {binLabel(t.destinationBinId)} · qty {t.quantity} · <span className="font-medium">{t.status}</span></div></div><div className="flex flex-wrap gap-2">{t.status==="pending"&&<Button size="sm" onClick={()=>run(()=>void approveWarehouseTransfer(t.id))}>Approve</Button>}{t.status==="approved"&&<Button size="sm" variant="outline" onClick={()=>run(()=>void dispatchWarehouseTransfer(t.id))}>Dispatch</Button>}{(t.status==="approved"||t.status==="in_transit")&&<Button size="sm" onClick={()=>run(()=>void completeWarehouseTransfer(t.id))}>Complete</Button>}{!["completed","cancelled"].includes(t.status)&&<Button size="sm" variant="outline" onClick={()=>run(()=>void cancelWarehouseTransfer(t.id))}>Cancel</Button>}</div></div>)}
    </CardContent></Card>
  </div>;
}
