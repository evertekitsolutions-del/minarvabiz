import { parseProductVariants, type ProductVariantDraft } from "@minarvabiz/business-logic";

/** Price saved in sellingPrice is the offer; never overwrite the MRP. */
export function parseBoutiquePrices(mrpText: string, offerText: string) {
  const valid = (text:string) => /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text.trim()) &&
    Number.isFinite(Number(text)) && Number.isSafeInteger(Math.round(Number(text)*100));
  if (!valid(mrpText) || !valid(offerText) || Number(offerText)>Number(mrpText))
    throw new Error("Enter valid MRP and offer price (offer must not exceed MRP; max 2 decimals)");
  return {mrp:Number(mrpText),offer:Number(offerText)};
}
export function verifyBoutiqueVariantStock(drafts:readonly ProductVariantDraft[],brand:string,expected:string){
  const rows=parseProductVariants(drafts.map(row=>({...row,brand:row.brand?.trim()||brand})));
  const total=rows.reduce((sum,row)=>sum+row.quantity,0);
  if(!/^[0-9]+$/.test(expected)||!Number.isSafeInteger(Number(expected))||Number(expected)!==total)
    throw new Error(`Total stock must exactly match the sum of variant quantities (${total} pcs)`);
  return total;
}
