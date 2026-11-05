import * as React from "react";
import { Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import type { PaymentMethod, Product, ServiceOrder, Supplier } from "@minarvabiz/types";

export type PurchaseStockDraft = { productId: string; quantity: string; unitCost: string };
export type BoutiquePurchaseDraft = {
  date: string; supplierId: string; description: string; amount: string;
  paidAmount: string; paymentMethod: PaymentMethod;
  kind: "general" | "order_specific"; orderId: string; notes: string;
};

function money(value: number) { return "₹" + value.toFixed(2); }

export function DesktopPurchaseEntryModal({
  open, form, setForm, lines, setLines, suppliers, products, orders,
  onClose, onSave, onAddSupplier, onCreateProduct,
}: {
  open: boolean;
  form: BoutiquePurchaseDraft;
  setForm: React.Dispatch<React.SetStateAction<BoutiquePurchaseDraft>>;
  lines: PurchaseStockDraft[];
  setLines: React.Dispatch<React.SetStateAction<PurchaseStockDraft[]>>;
  suppliers: Supplier[]; products: Product[]; orders: ServiceOrder[];
  onClose: () => void; onSave: () => void;
  onAddSupplier: () => void; onCreateProduct: () => void;
}) {
  const available = React.useMemo(() =>
    products.filter(p => p.isActive && !p.deletedAt && !p.hasVariants)
      .sort((a,b) => a.name.localeCompare(b.name)), [products]);
  const stockAmount = lines.reduce((sum, line) => {
    const qty = Number(line.quantity), price = Number(line.unitCost);
    return sum + (Number.isFinite(qty) && Number.isFinite(price) ? Math.round(qty * price * 100) : 0);
  }, 0) / 100;
  const setLine = (index: number, patch: Partial<PurchaseStockDraft>) =>
    setLines(rows => rows.map((row,i) => i === index ? { ...row, ...patch } : row));
  const addLine = () => setLines(rows => [...rows, {
    productId: "", quantity: "1", unitCost: "0",
  }]);
  const stockIntake = lines.length > 0;

  return <Modal
    open={open} title="Add Purchase"
    onClose={onClose}
    footer={<><Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={onSave}>Save Purchase & Receive Stock</Button></>}
  ><div className="space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label="Bill date"><input className={inputClass} type="date" value={form.date} onChange={e=>setForm(v=>({...v,date:e.target.value}))}/></FormField>
      <FormField label="Supplier"><div className="flex gap-2"><select className={selectClass} value={form.supplierId} onChange={e=>setForm(v=>({...v,supplierId:e.target.value}))}>
        <option value="">Choose supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select><Button type="button" variant="outline" onClick={onAddSupplier}>+ Supplier</Button></div></FormField>
      <FormField label="Description / Supplier bill / reference *"><input className={inputClass} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} placeholder="Supplier invoice number / details"/></FormField>
      <FormField label="Purchase type"><select className={selectClass} value={form.kind} onChange={e=>{setForm(v=>({...v,kind:e.target.value as "general"|"order_specific"}));if(e.target.value!=="general")setLines([]);}}>
        <option value="general">Stock / General</option><option value="order_specific">Tailoring order expense</option>
      </select></FormField>
    </div>

    {form.kind==="general" && <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold text-slate-900">Products on this supplier bill</h3>
          <p className="text-xs text-slate-600">Select exact brand, fabric, size and colour variant. Each received quantity is added to that variant's stock.</p></div>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={onCreateProduct}>+ New Product / Variant</Button>
          <Button type="button" size="sm" onClick={addLine}>+ Add Bill Item</Button></div>
      </div>
      {lines.map((row,i) => {
        const selected=available.find(p=>p.id===row.productId);
        return <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="flex justify-between gap-2"><strong className="text-sm text-slate-800">Item {i+1}</strong><Button type="button" size="sm" variant="outline" onClick={()=>setLines(rows=>rows.filter((_,j)=>i!==j))}>Remove</Button></div>
          <FormField label="Product / exact variant *"><select className={selectClass} value={row.productId}
            onChange={e=>{const p=available.find(p=>p.id===e.target.value);setLine(i,{productId:e.target.value,unitCost:p?String(p.costPrice):"0"});}}>
            <option value="">Select product / size / colour</option>
            {available.map(p=><option key={p.id} value={p.id}>
              {p.name} · {[p.brand,p.fabric,p.size,p.color].filter(Boolean).join(" / ")} {p.sku ? "["+p.sku+"]" : ""}
            </option>)}
          </select></FormField>
          {selected && <p className="text-xs text-slate-600">Brand: {selected.brand||"—"} · Fabric: {selected.fabric||"—"} · Size: {selected.size||"—"} · Colour: {selected.color||"—"} · Unit: {selected.unit} · Available: {selected.stockQuantity} · MRP: {money(selected.mrp??selected.sellingPrice)} · Offer: {money(selected.specialOfferPrice??selected.sellingPrice)}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <FormField label={`Quantity (${selected?.unit||"pcs"}) *`}><input type="number" step="0.001" min="0" className={inputClass} value={row.quantity} onChange={e=>setLine(i,{quantity:e.target.value})}/></FormField>
            <FormField label="Purchase unit cost *"><input type="number" step="0.01" min="0" className={inputClass} value={row.unitCost} onChange={e=>setLine(i,{unitCost:e.target.value})}/></FormField>
            <FormField label="Line total"><input readOnly className={inputClass} value={money(Math.max(0,(Number(row.quantity)||0)*(Number(row.unitCost)||0)))}/></FormField>
          </div>
        </div>;
      })}
      <div className="flex items-center justify-between text-sm font-semibold text-indigo-900">
        <span>{lines.length} line(s) · Stock intake total</span><span>{money(stockAmount)}</span>
      </div>
      {!stockIntake && <p className="text-xs text-slate-600">Add bill items to receive stock, or leave this section empty for an expense-only purchase.</p>}
    </section>}

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FormField label={stockIntake?"Bill total (from items)":"Purchase amount *"}>
        <input className={inputClass} type="number" min="0" step="0.01" readOnly={stockIntake}
          value={stockIntake?stockAmount.toFixed(2):form.amount} onChange={e=>setForm(v=>({...v,amount:e.target.value}))}/></FormField>
      <FormField label="Paid amount"><input className={inputClass} type="number" min="0" step="0.01" value={form.paidAmount} onChange={e=>setForm(v=>({...v,paidAmount:e.target.value}))}/></FormField>
      <FormField label="Payment method"><select className={selectClass} value={form.paymentMethod} onChange={e=>setForm(v=>({...v,paymentMethod:e.target.value as PaymentMethod}))}>
        {(["cash","card","upi","bank","online","other"] as const).map(method=><option key={method} value={method}>{method.toUpperCase()}</option>)}
      </select></FormField>
      {form.kind==="order_specific" && <FormField label="Tailoring order"><select className={selectClass} value={form.orderId} onChange={e=>setForm(v=>({...v,orderId:e.target.value}))}>
        <option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.orderNumber}</option>)}
      </select></FormField>}
      <FormField label="Notes"><textarea className={inputClass} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></FormField>
    </div>
  </div></Modal>;
}
