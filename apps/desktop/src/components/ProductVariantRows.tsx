import * as React from "react";
import type { ProductVariantDraft } from "@minarvabiz/business-logic";
import { Button, FormField, inputClass } from "@minarvabiz/ui";

export function ProductVariantRows({
  enabled, onEnabledChange, rows, onRowsChange, existing, editing, options,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rows: ProductVariantDraft[];
  onRowsChange: (rows: ProductVariantDraft[]) => void;
  existing: ReadonlyArray<{ id: string; size?: string | null; color?: string | null; fabric?: string | null; brand?: string | null; stockQuantity: number; barcode?: string | null }>;
  editing: boolean;
  options: { brand: string[]; fabric: string[]; size: string[]; color: string[]; unit: string[] };
}) {
  const add = () => onRowsChange([...rows, { size: "", color: "", material: "", brand: "", quantity: "0", sku: "", barcode: "" }]);
  const edit = (index: number, patch: Partial<ProductVariantDraft>) =>
    onRowsChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const quantity = rows.reduce((total, row) => total + (Number.isSafeInteger(Number(row.quantity)) && Number(row.quantity) >= 0 ? Number(row.quantity) : 0), 0);
  const stocked = existing.reduce((total, item) => total + item.stockQuantity, 0);

  return <div className="col-span-full rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
    <label className="flex items-center gap-2 font-semibold text-slate-900">
      <input aria-label="This product has multiple sizes, colours or materials" type="checkbox"
        checked={enabled} disabled={editing && existing.length > 0}
        onChange={event => { onEnabledChange(event.target.checked); if(event.target.checked && rows.length === 0) add(); }}/>
      Multiple sizes / colours / materials (variant stock)
    </label>
    {enabled && <>
      <p className="text-xs text-slate-600">
        Enter stock separately for each size + colour + material combination.
        Every row has its own barcode and stock; leave Barcode blank to generate one.
        {editing ? " New rows can be added below; existing quantities are changed with Stock on the variant row." : ""}
      </p>
      {existing.length > 0 && <div className="rounded-lg bg-white p-3 text-sm">
        <strong>Existing variants ({existing.length}) — {stocked} pcs total</strong>
        <div className="mt-2 flex flex-wrap gap-2">
          {existing.map(item => <span key={item.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs">
            {[item.brand,item.size,item.color,item.fabric].filter(Boolean).join(" / ")} · {item.stockQuantity} pcs
          </span>)}
        </div>
      </div>}
      <datalist id="boutique-variant-brands">{options.brand.map(value=><option key={value} value={value}/>)}</datalist>
      <datalist id="boutique-variant-sizes">{options.size.map(value=><option key={value} value={value}/>)}</datalist>
      <datalist id="boutique-variant-colours">{options.color.map(value=><option key={value} value={value}/>)}</datalist>
      <datalist id="boutique-variant-fabrics">{options.fabric.map(value=><option key={value} value={value}/>)}</datalist>
      <div className="space-y-3">
        {rows.map((row,index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-7">
          <FormField label="Brand"><input list="boutique-variant-brands" className={inputClass} placeholder="Brand" value={row.brand||""} onChange={e=>edit(index,{brand:e.target.value})}/></FormField>
          <FormField label="Size"><input className={inputClass} list="boutique-variant-sizes" placeholder="S / M / L / 38 / 40" value={row.size} onChange={e => edit(index,{size:e.target.value})}/></FormField>
          <FormField label="Colour"><input list="boutique-variant-colours" className={inputClass} placeholder="Red" value={row.color} onChange={e => edit(index,{color:e.target.value})}/></FormField>
          <FormField label="Fabric"><input list="boutique-variant-fabrics" className={inputClass} placeholder="Cotton" value={row.material} onChange={e => edit(index,{material:e.target.value})}/></FormField>
          <FormField label="Quantity (pcs) *"><input className={inputClass} inputMode="numeric" type="number" step="1" min="0" value={row.quantity} onChange={e => edit(index,{quantity:e.target.value})}/></FormField>
          <FormField label="SKU (optional)"><input className={inputClass} value={row.sku} onChange={e => edit(index,{sku:e.target.value})}/></FormField>
          <FormField label="Barcode (optional)"><input className={inputClass} value={row.barcode} onChange={e => edit(index,{barcode:e.target.value})}/></FormField>
          <div className="col-span-full flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => onRowsChange(rows.filter((_,i)=>i!==index))}>Remove row</Button></div>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={add}>+ Add brand / size / colour / fabric</Button>
        <strong className="text-sm text-indigo-800">New rows: {quantity} pcs · Total: {stocked + quantity} pcs</strong>
      </div>
    </>}
  </div>;
}
