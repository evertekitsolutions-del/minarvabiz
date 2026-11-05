import * as React from "react";
import { Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import type { Product, Category, Supplier } from "@minarvabiz/types";
import type { ProductVariantDraft } from "@minarvabiz/business-logic";
import { ProductVariantRows } from "./ProductVariantRows";

export type BoutiqueProductDraft = {
  name:string; sku:string; barcode:string; categoryId:string; brand:string;
  size:string; color:string; fabric:string; unit:string; costPrice:string; mrp:string; sellingPrice:string;
  discount:string; taxRate:string; stockQuantity:string; minimumStock:string;
  supplierId:string; imageUrl:string; notes:string; hasVariants:boolean;
};

export function ProductEditorModal({
  productOpen, editingProductId, productForm, setProductForm, categories, suppliers,
  onClose, onSave, onAddCategory, onAddSupplier, onGenerateBarcode,
  variantRows, setVariantRows, existingVariants, catalogProducts = [],
}: {
  productOpen:boolean; editingProductId:string|null;
  productForm:BoutiqueProductDraft;
  setProductForm:React.Dispatch<React.SetStateAction<BoutiqueProductDraft>>;
  categories:Category[]; suppliers:Supplier[];
  onClose:()=>void; onSave:()=>void;
  onAddCategory:()=>void; onAddSupplier:()=>void;
  onGenerateBarcode:()=>string;
  variantRows:ProductVariantDraft[];
  setVariantRows:React.Dispatch<React.SetStateAction<ProductVariantDraft[]>>;
  existingVariants:Product[];
  catalogProducts?:Product[];
}) {
  const options = (key: "brand"|"fabric"|"size"|"color"|"unit") => [...new Set(catalogProducts.map(p => p[key]?.trim()).filter((v):v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b));
  const totals = existingVariants.reduce((sum,p)=>sum+p.stockQuantity,0)+variantRows.reduce((sum,r)=>sum+(Number(r.quantity)||0),0);
  return (
<Modal open={productOpen} title={editingProductId?"Edit Product":"Add Product"} onClose={onClose} footer={<><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={onSave}>{editingProductId?"Update Product":"Save Product"}</Button></>}><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="Product name *"><input className={inputClass} value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})}/></FormField><div><FormField label="Category"><div className="flex gap-2"><select className={selectClass} value={productForm.categoryId} onChange={e=>setProductForm({...productForm,categoryId:e.target.value})}><option value="">No category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Button type="button" variant="outline" onClick={()=>{onAddCategory();}}>+ Category</Button></div></FormField></div><FormField label="SKU"><input className={inputClass} value={productForm.sku} onChange={e=>setProductForm({...productForm,sku:e.target.value})}/></FormField><FormField label="Barcode"><div className="flex gap-2"><input className={inputClass} value={productForm.barcode} onChange={e=>setProductForm({...productForm,barcode:e.target.value})}/><Button type="button" variant="outline" onClick={()=>setProductForm({...productForm,barcode:onGenerateBarcode()})}>Generate</Button></div><p className="mt-1 text-[11px] text-slate-500">Internal EAN-13 compatible barcode for shop scanning.</p></FormField><FormField label="Brand"><input list="boutique-brand-options" className={inputClass} value={productForm.brand} onChange={e=>setProductForm({...productForm,brand:e.target.value})}/></FormField><FormField label="Material / Fabric"><input list="boutique-fabric-options" className={inputClass} value={productForm.fabric} onChange={e=>setProductForm({...productForm,fabric:e.target.value})}/></FormField><FormField label="Size"><input list="boutique-size-options" className={inputClass} value={productForm.size} onChange={e=>setProductForm({...productForm,size:e.target.value})}/></FormField><FormField label="Color"><input list="boutique-color-options" className={inputClass} value={productForm.color} onChange={e=>setProductForm({...productForm,color:e.target.value})}/></FormField><FormField label="Unit"><input list="boutique-unit-options" className={inputClass} value={productForm.unit} onChange={e=>setProductForm({...productForm,unit:e.target.value})}/></FormField><FormField label="Cost price"><input className={inputClass} type="number" value={productForm.costPrice} onChange={e=>setProductForm({...productForm,costPrice:e.target.value})}/></FormField><FormField label="MRP *"><input className={inputClass} type="number" min="0" step="0.01" value={productForm.mrp} onChange={e=>setProductForm({...productForm,mrp:e.target.value})}/></FormField><FormField label="Special Offer Price * (billing price)"><input className={inputClass} type="number" min="0" step="0.01" value={productForm.sellingPrice} onChange={e=>setProductForm({...productForm,sellingPrice:e.target.value})}/></FormField><FormField label="Discount %"><input className={inputClass} type="number" min="0" value={productForm.discount} onChange={e=>setProductForm({...productForm,discount:e.target.value})}/></FormField><FormField label="Tax %"><input className={inputClass} type="number" min="0" value={productForm.taxRate} onChange={e=>setProductForm({...productForm,taxRate:e.target.value})}/></FormField><FormField label={editingProductId?"Stock (use Adjust Stock)":productForm.hasVariants?"Total opening stock (all variants)":"Opening stock"}><input className={inputClass} type="number" min="0" step={productForm.hasVariants?"1":"0.001"} value={editingProductId&&productForm.hasVariants?String(totals):productForm.stockQuantity} disabled={Boolean(editingProductId)} onChange={e=>setProductForm({...productForm,stockQuantity:e.target.value})}/></FormField><FormField label="Minimum stock"><input className={inputClass} type="number" min="0" step="0.001" value={productForm.minimumStock} onChange={e=>setProductForm({...productForm,minimumStock:e.target.value})}/></FormField><div><FormField label="Supplier"><div className="flex gap-2"><select className={selectClass} value={productForm.supplierId} onChange={e=>setProductForm({...productForm,supplierId:e.target.value})}><option value="">No supplier</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><Button type="button" variant="outline" onClick={()=>{onAddSupplier();}}>+ Supplier</Button></div></FormField></div><FormField label="Image URL"><input className={inputClass} value={productForm.imageUrl} onChange={e=>setProductForm({...productForm,imageUrl:e.target.value})}/></FormField><FormField label="Notes"><textarea className={inputClass} value={productForm.notes} onChange={e=>setProductForm({...productForm,notes:e.target.value})}/></FormField><ProductVariantRows enabled={productForm.hasVariants}
  onEnabledChange={enabled=>setProductForm(v=>({...v,hasVariants:enabled,stockQuantity:enabled?"":v.stockQuantity,barcode:enabled?"":v.barcode}))}
  rows={variantRows} onRowsChange={setVariantRows} existing={existingVariants} editing={Boolean(editingProductId)} catalogProducts={catalogProducts}/>
  {(["brand","fabric","size","color","unit"] as const).map(key=><datalist key={key} id={`boutique-${key}-options`}>{(key==="size"?[...new Set(["XS","S","M","L","XL","XXL","XXXL","28","30","32","34","36","38","40","42",...options(key)])]:key==="unit"?[...new Set(["pcs","set","m","cm","kg",...options(key)])]:options(key)).map(value=><option key={value} value={value}/>)}</datalist>)}
  </div></Modal>
  );
}
