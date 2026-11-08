import { parseProductVariants, type ProductVariantDraft } from "@minarvabiz/business-logic";

/** The Boutique operator enters exactly the customer-facing GST-inclusive Price. */
export function parseBoutiquePrice(priceText: string): number {
  const input = priceText.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?$/.test(input)) {
    throw new Error("Enter a valid GST-inclusive Price (max 2 decimals)");
  }
  const price = Number(input);
  if (!Number.isFinite(price) || !Number.isSafeInteger(Math.round(price * 100))) {
    throw new Error("Price is outside the safe money range");
  }
  return price;
}

export function verifyBoutiqueVariantStock(drafts:readonly ProductVariantDraft[],brand:string,expected:string){
  const rows=parseProductVariants(drafts.map(row=>({...row,brand:row.brand?.trim()||brand})));
  const total=rows.reduce((sum,row)=>sum+row.quantity,0);
  if(!/^[0-9]+$/.test(expected)||!Number.isSafeInteger(Number(expected))||Number(expected)!==total)
    throw new Error(`Total stock must exactly match the sum of variant quantities (${total} pcs)`);
  return total;
}
