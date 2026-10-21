/**
 * SAL-004: printable invoice-linked A4 DELIVERY NOTE, not a new stock event.
 * Copies persisted original sale quantities and dimension audit data. Printing
 * does NOT record dispatch/receipt, reserve stock or produce a statutory GST
 * delivery challan requiring independent numbering/HSN/reason/tax fields.
 */
import type { Sale } from "@minarvabiz/types";
import { toQuantityMilli, QUANTITY_MILLI_FACTOR } from "@minarvabiz/utils";
import { escapeHtml } from "./html";
import { parseDimensionLineMetadata } from "./dimensional-billing";
import { getPrintTemplateFor } from "./print-settings";
import { businessHeaderHtml, customerBlockHtml, documentCss, documentFooterHtml } from "./print-document-render";
import { requestDesktopPrintHtml } from "./desktop-print";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { getCustomer, getSale } from "./store";
import type { SaleInvoicePrintAttempt } from "./invoice";

function assertPrintable(sale:Sale):void{
 if(!sale || sale.deletedAt || !["completed","partial"].includes(sale.status) ||
   !Array.isArray(sale.items) || sale.items.length===0 ||
   !sale.invoiceNumber?.trim())throw new Error("Delivery note requires a saved, posted invoice");
 for(const item of sale.items){
  const q=toQuantityMilli(item.quantity);
  if(!item.productId||!Number.isFinite(item.quantity)||item.quantity<=0||
    Math.abs(q/QUANTITY_MILLI_FACTOR-item.quantity)>1e-9){
    throw new Error("Original invoice has an invalid line quantity");
  }
 }
}
/** A4 customer-printable nonfinancial packing summary. */
export function buildSaleDeliveryNoteHtml(sale:Sale,autoPrint=false):string{
 assertPrintable(sale);
 const template={...getPrintTemplateFor("invoice","a4"),
   heading:"DELIVERY NOTE",subheading:"Invoice-linked packing list — not proof of delivery",
   showTax:false,showTerms:false,showPaymentSummary:false,showNotes:false};
 const customer=sale.customerId?getCustomer(sale.customerId):null;
 const rows=sale.items.map((item,index)=>{
   const milli=toQuantityMilli(item.quantity);
   let sizeInfo="";
   if(item.dimensionMetadata!=null){
     const d=parseDimensionLineMetadata(item.dimensionMetadata,milli);
     sizeInfo='<div class="meta">Area: '+
       escapeHtml(d.length)+" "+escapeHtml(d.lengthUnit)+" × "+
       escapeHtml(d.width)+" "+escapeHtml(d.widthUnit)+" × "+
       escapeHtml(d.pieces)+" pcs = "+
       escapeHtml(d.quantityMilli/QUANTITY_MILLI_FACTOR)+" "+
       escapeHtml(d.billableUnit)+"</div>";
   }
   return '<tr><td class="c">'+(index+1)+'</td><td>'+
     escapeHtml(item.productName)+(item.sku?'<div class="meta">SKU: '+
     escapeHtml(item.sku)+"</div>":"")+sizeInfo+
     '</td><td class="r">'+escapeHtml(item.quantity)+'</td></tr>';
 }).join("");
 const extraMeta="Source invoice: "+sale.invoiceNumber+" | Original sale: "+sale.saleDate;
 return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Delivery Note '+
    escapeHtml(sale.invoiceNumber)+'</title><style>'+
    documentCss(template,"210mm")+'</style></head><body><div class="sheet">'+
    businessHeaderHtml(template,{
      number:"DN / "+sale.invoiceNumber,date:new Date(),
      fallbackTitle:"DELIVERY NOTE",extraMeta,
    })+
    customerBlockHtml(template,customer,sale.customerName||"Walk-in")+
    '<p class="header-note">Packing/reference slip generated from the original invoice. '+
    'Actual goods dispatched, received, returned or credited are NOT recorded by printing. '+
    'This is not a separately issued statutory tax delivery challan.</p>'+
    '<table><thead><tr><th class="c">#</th><th>Item / description</th>'+
    '<th class="r">Original invoice qty</th></tr></thead><tbody>'+
    rows+'</tbody></table>'+
    documentFooterHtml(template,null)+'</div>'+
    (autoPrint?'<script>window.onload=function(){window.print&&window.print()}</script>':"")+
    '</body></html>';
}

/**
 * Uses only host-persisted invoice, never the UI's editable Sale object.
 * Popup must open during the click; native printers use the existing bridge.
 */
export function requestSaleDeliveryNotePrint(saleId:string):Promise<SaleInvoicePrintAttempt>{
 if(typeof window==="undefined")return Promise.resolve({
   ok:false,state:"blocked",error:"Printing requires an app window",
 });
 try{
  assertPermission("sales.create");
  const saved=getSale(saleId);
  if(!saved)throw new Error("Source sale no longer exists");
  const branch=getActiveBranch();
  if(saved.branchId!=null && (!branch||saved.branchId!==branch.id)){
    throw new Error("Source sale is outside the active branch");
  }
  const preview=buildSaleDeliveryNoteHtml(saved,false);
  const native=requestDesktopPrintHtml(preview,"a4");
  if(native)return native.then(r=>r.ok?
    {ok:true,state:"native-accepted"} as const:
    {ok:false,state:"blocked",error:r.error||"Delivery note printer rejected request"} as const);
  const popup=window.open("","_blank","width=900,height=900");
  if(!popup)return Promise.resolve({ok:false,state:"blocked",
    error:"Delivery note window was blocked; allow popups and retry."});
  try{
   popup.document.write(buildSaleDeliveryNoteHtml(saved,true));
   popup.document.close();
  }catch(error){
   try{popup.close()}catch{/**/}
   throw error;
  }
  return Promise.resolve({ok:true,state:"browser-window-opened"});
 }catch(error){
  return Promise.resolve({
   ok:false,state:"blocked",
   error:error instanceof Error?error.message:String(error),
  });
 }
}
