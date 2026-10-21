/**
 * INV-021 — slow/dead *sales activity* report for CURRENT stock on hand.
 *
 * This does not purport to be physical stock ageing or a FIFO/lot receipt-age
 * report: receipt/transfer timestamp attribution is not available here.
 * Returns/refunds, external channels and stock reconciliation may differ.
 */
import type { Product, Sale } from "@minarvabiz/types";
import {
  fromMinorUnits, multiplyMinorByQuantity, toMinorUnits,
  toQuantityMilli, QUANTITY_MILLI_FACTOR,
} from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listProducts, listSales } from "./store";

export type InventoryDormancyBand = "slow_90" | "dormant_180" | "dead_365";
export interface InventoryDormancyRow {
  productId:string;
  productName:string;
  sku:string|null;
  currentStock:number;
  historicalCostValue:number;
  lastSaleDate:string|null;
  firstRecordedDate:string;
  daysWithoutSale:number;
  band:InventoryDormancyBand;
}
export const INVENTORY_DORMANCY_LABELS:Record<InventoryDormancyBand,string>={
 slow_90:"90–179 days",dormant_180:"180–364 days",dead_365:"365+ days",
};

function dateDay(date:string,label:string):string {
 if(typeof date!=="string")throw new Error(label+" is invalid");
 const normalized=date.slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized))throw new Error(label+" is invalid");
 const parsed=new Date(normalized+"T00:00:00.000Z");
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==normalized){
   throw new Error(label+" is invalid");
 }
 return normalized;
}
const UTC_DAY=86_400_000;
function utcEpoch(day:string):number{return Date.parse(day+"T00:00:00.000Z");}

/**
 * Returns rows showing no observed product sale in >=minInactiveDays days.
 * Inventory quantity and historic catalogue unit cost are CURRENT snapshots;
 * the latter is NOT historical purchase-batch cost.
 */
export function calculateInactiveStock(
 products:readonly Product[],sales:readonly Sale[],asOfDate:string,
 minInactiveDays:90|180|365=180,
):InventoryDormancyRow[]{
 if(![90,180,365].includes(minInactiveDays))throw new Error("Unsupported inactivity threshold");
 const today=dateDay(asOfDate,"Report date"),nowEpoch=utcEpoch(today);
 const latestSale=new Map<string,string>();
 const wanted=new Set(products.filter(p=>!p.deletedAt).map(p=>p.id));
 for(const sale of sales){
   if(sale.deletedAt||!["completed","partial"].includes(sale.status))continue;
   const soldDay=dateDay(sale.saleDate,"Posted sale date");
   if(soldDay>today)continue;
   for(const line of sale.items??[]){
     if(!wanted.has(line.productId))continue;
     if(!Number.isFinite(line.quantity)||line.quantity<=0)throw new Error("Invalid historic sold quantity");
     const prev=latestSale.get(line.productId);
     if(!prev||soldDay>prev)latestSale.set(line.productId,soldDay);
   }
 }
 const rows:InventoryDormancyRow[]=[];
 for(const product of products){
   if(product.deletedAt)continue;
   if(!Number.isFinite(product.stockQuantity)||product.stockQuantity<=0||
      !Number.isFinite(product.costPrice)||product.costPrice<0){
     if(product.stockQuantity<=0&&Number.isFinite(product.stockQuantity))continue;
     throw new Error("Inventory stock or cost is invalid");
   }
   const milli=toQuantityMilli(product.stockQuantity);
   if(Math.abs(milli/QUANTITY_MILLI_FACTOR-product.stockQuantity)>1e-9){
     throw new Error("Inventory stock exceeds 0.001 precision");
   }
   const created=dateDay(product.createdAt,"Product creation date");
   // An imported product can legitimately have no sale. Use catalog creation
   // date ONLY as fallback instead of falsely inventing stock receipt age.
   const saleDay=latestSale.get(product.id)??null;
   const activityDay=saleDay??created;
   if(activityDay>today)continue;
   const days=Math.floor((nowEpoch-utcEpoch(activityDay))/UTC_DAY);
   if(days<minInactiveDays)continue;
   const costMinor=multiplyMinorByQuantity(toMinorUnits(product.costPrice),product.stockQuantity);
   rows.push({
     productId:product.id,productName:product.name,sku:product.sku??null,
     currentStock:product.stockQuantity,historicalCostValue:fromMinorUnits(costMinor),
     lastSaleDate:saleDay,firstRecordedDate:created,daysWithoutSale:days,
     band:days>=365?"dead_365":days>=180?"dormant_180":"slow_90",
   });
 }
 return rows.sort((a,b)=>b.daysWithoutSale-a.daysWithoutSale||
   b.historicalCostValue-a.historicalCostValue||
   a.productName.localeCompare(b.productName)||a.productId.localeCompare(b.productId));
}

/** Read-only role+branch scoped report for local-first Web/Windows data. */
export function listAuthorizedInactiveStock(
 minInactiveDays:90|180|365=180,asOf=new Date(),
):InventoryDormancyRow[]{
 assertPermission("reports.view");
 if(!Number.isFinite(asOf.getTime()))throw new Error("Invalid report timestamp");
 const today=asOf.toISOString().slice(0,10);
 const branch=getActiveBranch();
 const scoped=<T extends{branchId?:string|null}>(items:readonly T[])=>
   items.filter(item=>item.branchId==null||(branch!=null&&item.branchId===branch.id));
 return calculateInactiveStock(scoped(listProducts()),scoped(listSales()),today,minInactiveDays);
}
