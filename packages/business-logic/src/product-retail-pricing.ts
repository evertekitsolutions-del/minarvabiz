import type { Product } from "@minarvabiz/types";

export function validateProductRetailPricing(input: Partial<Product> & { sellingPrice: number }): void {
  for (const field of ["costPrice","sellingPrice","mrp","specialOfferPrice","discount","taxRate","stockQuantity","minimumStock"] as const) {
    const value=input[field];
    if (value!=null && !Number.isFinite(value)) throw new Error(`Product ${field} must be a finite number`);
  }
  const mrp=input.mrp??input.sellingPrice,offer=input.specialOfferPrice??input.sellingPrice;
  if (mrp<0||offer<0||offer>mrp||offer!==input.sellingPrice||
    !Number.isSafeInteger(Math.round(mrp*100))||!Number.isSafeInteger(Math.round(offer*100))||
    Math.round(mrp*100)/100!==mrp||Math.round(offer*100)/100!==offer) {
    throw new Error("Product MRP / special offer prices are inconsistent");
  }
}

export function calculateWeightedReceiptCost(
  stockBefore:number,oldCost:number,incomingQuantity:number,incomingUnitCost:number,stockAfter:number,
):number {
  if (![stockBefore,oldCost,incomingQuantity,incomingUnitCost,stockAfter].every(Number.isFinite) ||
    stockBefore<0||oldCost<0||incomingQuantity<=0||incomingUnitCost<0||
    !Number.isSafeInteger(Math.round(incomingUnitCost*100)) || stockAfter<=0) {
    throw new Error("Purchase stock receipt requires a valid non-negative unit cost");
  }
  const amount=stockBefore*oldCost+incomingQuantity*incomingUnitCost;
  if (!Number.isFinite(amount)||!Number.isSafeInteger(Math.round(amount*100))) {
    throw new Error("Purchase stock valuation exceeds safe range");
  }
  return Math.round(amount/stockAfter*100)/100;
}
