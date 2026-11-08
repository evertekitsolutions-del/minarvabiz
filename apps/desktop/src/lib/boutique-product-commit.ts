/**
 * Boutique product mutation. UI must NOT report success until native SQLite
 * persist has acknowledged this complete product/variant state.
 */
import type { Product } from "@minarvabiz/types";
import {
  store, parseProductVariants, createProductVariantFamily, addProductVariants,
  parseNonNegativeStockQuantity, type ProductVariantDraft,
} from "@minarvabiz/business-logic";
import type { BoutiqueProductDraft } from "../components/ProductEditorModal";
import { parseBoutiquePrice, verifyBoutiqueVariantStock } from "./boutique-product-entry";

export function commitBoutiqueProductDraft(
  form: BoutiqueProductDraft,
  editingId: string | null,
  variants: readonly ProductVariantDraft[],
): void {
      if(!form.name.trim())throw new Error("Product name is required");
      const price=parseBoutiquePrice(form.mrp);
      if(form.hasVariants&&!editingId)verifyBoutiqueVariantStock(variants,form.brand,form.stockQuantity);
      const payload={
        name:form.name.trim(),sku:form.sku||null,barcode:form.barcode||null,
        categoryId:form.categoryId||null,brand:form.brand||null,
        size:form.size||null,color:form.color||null,fabric:form.fabric||null,
        unit:form.unit||"pcs",costPrice:Number(form.costPrice)||0,
        sellingPrice:price,mrp:price,discount:Number(form.discount)||0,
        taxRate:Number(form.taxRate)||0,
        stockQuantity:form.hasVariants?0:parseNonNegativeStockQuantity(form.stockQuantity),
        minimumStock:parseNonNegativeStockQuantity(form.minimumStock),
        supplierId:form.supplierId||null,imageUrl:form.imageUrl||null,
        notes:form.notes||null,isActive:true,
      };
      if(form.hasVariants) {
        if(editingId) {
          const previous=store.getProduct(editingId);
          if(!previous || previous.parentProductId)throw new Error("Edit individual variant stock separately");
          if(!previous.hasVariants && previous.stockQuantity!==0)
            throw new Error("First adjust existing single-product stock to zero before converting to variants");
          // Validate ALL new rows before mutating an existing parent.
          if(variants.length) {
            const existing=store.listProducts().filter(p=>p.parentProductId===editingId);
            parseProductVariants(variants,existing.map(p=>({
              size:p.size||"",color:p.color||"",material:p.fabric||"",brand:p.brand||"",sku:p.sku||null,barcode:p.barcode||null,
            })));
          }
          const patch:Partial<Product>={...payload,hasVariants:true,barcode:null,size:null,color:null,fabric:null};
          delete patch.stockQuantity;
          store.updateProduct(editingId,patch);
          if(variants.length)addProductVariants(editingId,variants);
        } else createProductVariantFamily(payload,variants);
      } else {
        if(editingId){
          const previous=store.getProduct(editingId);
          if(previous?.hasVariants)throw new Error("This product already has variants; edit individual stock rows instead");
          const patch:Partial<Product>={...payload};delete patch.stockQuantity;
          store.updateProduct(editingId,patch);
        } else store.createProduct(payload);
      }

}
