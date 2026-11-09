"use client";

import * as React from "react";
import { Button, FormField, Modal, inputClass, selectClass } from "@minarvabiz/ui";
import {
  can, getRuntimeMode, normalizeBoutiqueOptions,
} from "@minarvabiz/business-logic";
import type { Category, Product } from "@minarvabiz/types";
import {
  createBoutiqueVariantFamilyOnline, type BoutiqueVariantInput,
} from "../../../lib/online-boutique-variant-family";
import { parseProductPrice } from "../../../lib/parse-product-price";

type EditableVariant = Omit<BoutiqueVariantInput,"costPrice"|"sellingPrice"|"stockQuantity"> & {
  costPrice: string; sellingPrice: string; stockQuantity: string;
};
const newVariant = (parentSku: string, index: number): EditableVariant => {
  const id = crypto.randomUUID();
  return {
    id, brand: "", fabric: "", color: "", size: "",
    sku: parentSku.trim() ? parentSku.trim() + "-" + String(index).padStart(2,"0") : "SKU-" + id.slice(0,8).toUpperCase(),
    barcode: "M" + id.replaceAll("-","").slice(0,12).toUpperCase(),
    costPrice: "0", sellingPrice: "0", stockQuantity: "0",
  };
};

export function BoutiqueVariantMatrix({
  categories, products, onSaved,
}: { categories: Category[]; products: Product[]; onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);
  const pendingParentId = React.useRef<string | null>(null);
  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [minimumStock, setMinimumStock] = React.useState("0");
  const [variants, setVariants] = React.useState<EditableVariant[]>(() => [newVariant("",1)]);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<string | null>(null);

  const options = normalizeBoutiqueOptions([
    ...(["brand","fabric","color","size"] as const).map(code => ({
      code, values: products.map(product => ({
        label: String(product[code] ?? ""),
      })).concat(variants.map(variant => ({ label: variant[code] }))),
    })),
  ]);
  const sums = variants.reduce((sum,row) => sum + (Number(row.stockQuantity) || 0),0);
  const patch = (id: string, fields: Partial<EditableVariant>) =>
    setVariants(prev => prev.map(row => row.id === id ? { ...row, ...fields } : row));

  function reset() {
    pendingParentId.current = null;
    setName(""); setSku(""); setCategoryId(""); setMinimumStock("0");
    setVariants([newVariant("",1)]); setError(null);
  }
  function close() {
    if (inFlight.current) return;
    if (pendingParentId.current) {
      setError("Cloud status uncertain. Retry the SAME variant matrix before starting another product.");
      return;
    }
    setOpen(false); reset();
  }
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (!name.trim() || !variants.length) throw new Error("Product name and variants required.");
      const minimum = Number(minimumStock);
      if (!Number.isSafeInteger(minimum) || minimum < 0) throw new Error("Minimum stock must be nonnegative.");
      const draft = variants.map(row => {
        const qty = Number(row.stockQuantity);
        if (!/^(?:0|[1-9]\d*)$/.test(row.stockQuantity.trim()) || !Number.isSafeInteger(qty)) {
          throw new Error("Variant stock must be a nonnegative whole number.");
        }
        return {
          ...row, costPrice: parseProductPrice(row.costPrice, "Variant Cost"),
          sellingPrice: parseProductPrice(row.sellingPrice, "Price"),
          stockQuantity: qty,
        };
      });
      pendingParentId.current ??= crypto.randomUUID();
      const result = await createBoutiqueVariantFamilyOnline({
        parentId: pendingParentId.current, name: name.trim(),
        sku: sku.trim(), categoryId: categoryId || null, minimumStock: minimum,
        variants: draft,
      });
      setConfirmation(result.variants.length + " variants confirmed in Supabase; parent stock " +
        result.parent.stockQuantity + " pieces.");
      reset(); setOpen(false); onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Variant family NOT confirmed in Supabase.");
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  if (getRuntimeMode() === "demo" || !can("products.manage")) return null;
  return <section className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between gap-2">
      <div>
        <strong className="text-sm">Boutique Variant Matrix</strong>
        <p className="text-xs text-slate-500">Brand · Fabric · Color · Size · independent SKU, barcode and GST-inclusive Price.</p>
      </div>
      <Button type="button" onClick={() => { setConfirmation(null); setOpen(true); }}>Add Variant Product</Button>
    </div>
    {confirmation && <p role="status" className="mt-2 text-sm text-emerald-700">{confirmation}</p>}
    <Modal open={open} title="Create Boutique Variant Family" className="max-w-5xl" onClose={close}
      footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={() => { void save(); }}>
          {busy ? "Confirming all variants in Supabase…" : "Save Family & Opening Stock"}
        </Button>
      </>}>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <FormField label="Product Name *">
            <input className={inputClass} value={name} onChange={event => setName(event.target.value)} />
          </FormField>
          <FormField label="Parent SKU">
            <input className={inputClass} value={sku} onChange={event => setSku(event.target.value)} />
          </FormField>
          <FormField label="Category">
            <select className={selectClass} value={categoryId} onChange={event => setCategoryId(event.target.value)}>
              <option value="">None</option>{categories.map(category =>
                <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </FormField>
          <FormField label="Minimum Stock">
            <input className={inputClass} type="number" min="0" step="1"
              value={minimumStock} onChange={event => setMinimumStock(event.target.value)} />
          </FormField>
        </div>
        {variants.map((row,index) => <div key={row.id} className="rounded-lg border border-slate-200 p-2">
          <div className="flex items-center justify-between">
            <strong className="text-xs">Variant {index+1}</strong>
            <Button type="button" variant="outline" size="sm" disabled={busy || variants.length===1}
              onClick={() => setVariants(prev => prev.filter(item => item.id !== row.id))}>Remove</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {(["brand","fabric","color","size"] as const).map(code => {
              const suggestion = options.find(option => option.code === code);
              const listId = "boutique-" + code + "-" + row.id;
              return <FormField key={code} label={suggestion?.label ?? code}>
                <input className={inputClass} list={listId} value={row[code]}
                  placeholder={code === "size" ? "S / M / L / XL / custom measurements" : "Select or add"}
                  onChange={event => patch(row.id,{[code]:event.target.value})}/>
                <datalist id={listId}>{suggestion?.values.map(option =>
                  <option key={option.id} value={option.label}/>)}</datalist>
              </FormField>;
            })}
            <FormField label="Variant SKU *"><input className={inputClass} value={row.sku}
              onChange={event=>patch(row.id,{sku:event.target.value})}/></FormField>
            <FormField label="Barcode *"><input className={inputClass} value={row.barcode}
              onChange={event=>patch(row.id,{barcode:event.target.value})}/></FormField>
            <FormField label="Cost"><input className={inputClass} type="number" min="0" step=".01" value={row.costPrice}
              onChange={event=>patch(row.id,{costPrice:event.target.value})}/></FormField>
            <FormField label="Price (GST inclusive)"><input className={inputClass} type="number" min="0" step=".01"
              value={row.sellingPrice} onChange={event=>patch(row.id,{sellingPrice:event.target.value})}/></FormField>
            <FormField label="Opening Quantity"><input className={inputClass} type="number" min="0" step="1"
              value={row.stockQuantity} onChange={event=>patch(row.id,{stockQuantity:event.target.value})}/></FormField>
          </div>
        </div>)}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" disabled={busy||variants.length>=100}
            onClick={()=>setVariants(prev=>[...prev,newVariant(sku,prev.length+1)])}>Add Variant</Button>
          <p className="text-sm">Parent stock = sum of variants: <strong>{sums} pieces</strong></p>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </div>
    </Modal>
  </section>;
}
