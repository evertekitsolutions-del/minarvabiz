import * as React from "react";
import { Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { postBoutiqueStockPurchase, calculateBoutiqueStockPurchaseTotal, type BoutiqueStockPurchaseLine } from "@minarvabiz/business-logic";
import type { Product, Supplier, PaymentMethod } from "@minarvabiz/types";

type DraftLine = { productId:string; quantity:string; unitCost:string; taxRate:string };
const blank = ():DraftLine => ({productId:"",quantity:"1",unitCost:"0",taxRate:"0"});
const inputMoney = (text:string,label:string) => {
  const value=Number(text);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text.trim()) || !Number.isFinite(value))
    throw new Error(label+" must be a valid amount (max two decimals)");
  return value;
};
export function BoutiqueStockPurchaseModal({open,products,suppliers,onClose,onChanged,onCreateProduct}:{
  open:boolean; products:Product[]; suppliers:Supplier[];
  onClose:()=>void; onChanged:()=>void|Promise<void>; onCreateProduct:()=>void;
}) {
  const [supplierId,setSupplierId]=React.useState("");
  const [invoiceNumber,setInvoiceNumber]=React.useState("");
  const [invoiceDate,setInvoiceDate]=React.useState(()=>new Date().toLocaleDateString("en-CA"));
  const [lines,setLines]=React.useState<DraftLine[]>([blank()]);
  const [paidAmount,setPaidAmount]=React.useState("0");
  const [paymentMethod,setPaymentMethod]=React.useState<PaymentMethod>("cash");
  const [notes,setNotes]=React.useState("");
  const [error,setError]=React.useState<string|null>(null);
  const [busy,setBusy]=React.useState(false);
  const saving=React.useRef(false);
  const saleable=React.useMemo(()=>products.filter(p=>!p.deletedAt&&p.isActive&&!p.hasVariants),[products]);
  const byId=React.useMemo(()=>new Map(saleable.map(p=>[p.id,p])),[saleable]);
  const update=(i:number,patch:Partial<DraftLine>)=>setLines(current=>current.map((line,index)=>index===i?{...line,...patch}:line));
  const total=React.useMemo(()=>{
    try{return calculateBoutiqueStockPurchaseTotal(lines.map(line=>({
      productId:line.productId,quantity:Number(line.quantity),
      unitCost:Number(line.unitCost),taxRate:Number(line.taxRate),
    })));}
    catch{return Number.NaN;}
  },[lines]);
  async function save() {
    if(saving.current)return;
    saving.current=true;setBusy(true);setError(null);
    try {
      if(!supplierId||!invoiceNumber.trim())throw new Error("Select supplier and enter supplier invoice number");
      const parsed:BoutiqueStockPurchaseLine[]=lines.map((line,i)=>{
        if(!line.productId)throw new Error(`Row ${i+1}: select product variant`);
        if(!/^\d+$/.test(line.quantity)||Number(line.quantity)<=0)throw new Error(`Row ${i+1}: enter whole-piece quantity`);
        return {productId:line.productId,quantity:Number(line.quantity),
          unitCost:inputMoney(line.unitCost,`Row ${i+1} cost`),taxRate:inputMoney(line.taxRate,`Row ${i+1} tax`)};
      });
      const result=postBoutiqueStockPurchase({
        supplierId,supplierInvoiceNumber:invoiceNumber,invoiceDate,lines:parsed,
        paidAmount:inputMoney(paidAmount,"Paid amount"),paymentMethod,notes:notes.trim()||null
      });
      if(result.error||!result.invoice)throw new Error(result.error||"Supplier bill was not posted");
      // Only reset after the posting succeeds. On partial error the bill
      // number guard prevents accidental double receipt of the same invoice.
      await onChanged();
      setSupplierId("");setInvoiceNumber("");setLines([blank()]);
      setPaidAmount("0");setNotes("");
      onClose();
    }catch(cause){setError((cause instanceof Error?cause.message:String(cause))+" — If the invoice was already posted, check Procurement before retrying.");}
    finally{saving.current=false;setBusy(false);}
  }
  return <Modal open={open} title="Purchase Bill — Add Products to Stock"
    onClose={()=>{if(!busy)onClose();}}
    footer={<><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="button" onClick={save} disabled={busy||!saleable.length}>{busy?"Saving…":"Post Bill + Receive Stock"}</Button></>}>
    <div className="space-y-4">
      <p className="text-xs text-slate-600">Each size / brand / fabric / colour combination is a separate stock product. Receiving posts inventory once via a Goods Receipt and links the supplier invoice.</p>
      {error&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Supplier *"><select className={selectClass} value={supplierId} onChange={e=>setSupplierId(e.target.value)}>
          <option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FormField>
        <FormField label="Supplier Bill No. *"><input className={inputClass} value={invoiceNumber} maxLength={128} onChange={e=>setInvoiceNumber(e.target.value)}/></FormField>
        <FormField label="Bill date"><input className={inputClass} type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></FormField>
        <div className="flex items-end"><Button variant="outline" type="button" onClick={onCreateProduct}>+ Create Product / Variant</Button></div>
      </div>
      <div className="space-y-2">
        {lines.map((line,i)=>{
          const p=byId.get(line.productId);
          return <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
            <div className="col-span-2 sm:col-span-3"><FormField label="Product / exact variant *"><select className={selectClass} value={line.productId}
              onChange={e=>{const item=byId.get(e.target.value);update(i,{productId:e.target.value,unitCost:item?String(item.costPrice):"0",taxRate:item?String(item.taxRate||0):"0"});}}>
              <option value="">Select stock item</option>
              {saleable.map(item=><option key={item.id} value={item.id}>
                {item.name} · {item.brand||"No brand"} / {item.fabric||"Fabric—"} / {item.color||"Colour—"} / {item.size||"Size—"} · Stock {item.stockQuantity} · {item.unit}
              </option>)}
            </select></FormField></div>
            <FormField label="Quantity *"><input className={inputClass} type="number" min="1" step="1" value={line.quantity} onChange={e=>update(i,{quantity:e.target.value})}/></FormField>
            <FormField label="Unit cost"><input className={inputClass} type="number" min="0" step=".01" value={line.unitCost} onChange={e=>update(i,{unitCost:e.target.value})}/></FormField>
            <FormField label="Tax %"><input className={inputClass} type="number" min="0" max="100" step=".01" value={line.taxRate} onChange={e=>update(i,{taxRate:e.target.value})}/></FormField>
            {p&&<p className="col-span-full text-xs text-slate-600">Brand: {p.brand||"—"} · Fabric: {p.fabric||"—"} · Colour: {p.color||"—"} · Size: {p.size||"—"} · Unit: {p.unit} · MRP ₹{p.mrp??p.sellingPrice} · Offer ₹{p.sellingPrice}</p>}
            <div className="col-span-full flex justify-end"><Button type="button" variant="outline" size="sm" disabled={lines.length===1}
              onClick={()=>setLines(old=>old.filter((_,k)=>k!==i))}>Remove</Button></div>
          </div>;
        })}
      </div>
      <Button type="button" variant="outline" onClick={()=>setLines(old=>[...old,blank()])}>+ Add Bill Item</Button>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-end text-sm font-semibold">Bill total: ₹{Number.isFinite(total)?total.toFixed(2):"—"}</div>
        <FormField label="Paid now"><input className={inputClass} type="number" min="0" step=".01" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)}/></FormField>
        <FormField label="Payment method"><select className={selectClass} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as PaymentMethod)}>
          {(["cash","bank","upi","card","online","other"] as PaymentMethod[]).map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select></FormField>
      </div>
      <FormField label="Notes"><textarea className={inputClass} value={notes} onChange={e=>setNotes(e.target.value)}/></FormField>
    </div>
  </Modal>;
}
