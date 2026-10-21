/**
 * FIN-026 — original bill-wise posted sale margin from the historical
 * sale-line cost snapshot. Existing SAL-026 calculator is authoritative.
 *
 * Subsequent refunds, returns and overhead are NOT netted, so this is not
 * the final net profit or final statutory P&L for the invoice.
 */
import type { Sale } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits, subtractMinorUnits } from "@minarvabiz/utils";
import { calculateOriginalInvoiceGrossProfit } from "./invoice-gross-profit";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listSales } from "./store";

export interface BillOriginalGrossProfitRow {
  readonly saleId:string;
  readonly invoiceNumber:string;
  readonly invoiceDate:string;
  readonly customerName:string;
  readonly status:"completed"|"partial";
  readonly revenueExcludingTax:number;
  readonly historicalCost:number;
  readonly originalGrossProfit:number;
  readonly marginPercent:number;
}
export interface BillOriginalGrossProfitReport {
  readonly invoiceCount:number;
  readonly revenueExcludingTax:number;
  readonly historicalCost:number;
  readonly originalGrossProfit:number;
  readonly marginPercent:number;
  readonly rows:BillOriginalGrossProfitRow[];
}
function dateKey(input?:string):string|null {
 if(input===undefined||input==="")return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input))throw new Error("Invalid bill profit date");
 const parsed=new Date(input+"T00:00:00Z");
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==input)
   throw new Error("Invalid bill profit date");
 return input;
}

export function calculateBillOriginalGrossProfit(
 sales:readonly Sale[],from?:string,to?:string,
):BillOriginalGrossProfitReport {
 const start=dateKey(from),end=dateKey(to);
 if(start&&end&&start>end)throw new Error("Bill profit start date exceeds end date");
 const rows:BillOriginalGrossProfitRow[]=[];
 let revenue=0,cost=0;
 for(const sale of sales) {
   if(sale.deletedAt||!["completed","partial"].includes(sale.status))continue;
   const day=typeof sale.saleDate==="string"?dateKey(sale.saleDate.slice(0,10)):null;
   if(!day)throw new Error("Posted invoice has an invalid sale date");
   if(start&&day<start||end&&day>end)continue;
   const result=calculateOriginalInvoiceGrossProfit(sale);
   revenue=addMinorUnits(revenue,toMinorUnits(result.revenueExcludingTax));
   cost=addMinorUnits(cost,toMinorUnits(result.historicalCostOfGoods));
   rows.push({
     saleId:sale.id,invoiceNumber:sale.invoiceNumber,invoiceDate:day,
     customerName:sale.customerName?.trim()||"Walk-in",
     status:sale.status as "completed"|"partial",
     revenueExcludingTax:result.revenueExcludingTax,
     historicalCost:result.historicalCostOfGoods,
     originalGrossProfit:result.grossProfit,marginPercent:result.grossMarginPercent,
   });
 }
 rows.sort((a,b)=>b.invoiceDate.localeCompare(a.invoiceDate)||
   b.invoiceNumber.localeCompare(a.invoiceNumber)||a.saleId.localeCompare(b.saleId));
 const gross=subtractMinorUnits(revenue,cost);
 return{
   invoiceCount:rows.length,
   revenueExcludingTax:fromMinorUnits(revenue),
   historicalCost:fromMinorUnits(cost),
   originalGrossProfit:fromMinorUnits(gross),
   marginPercent:revenue===0?0:Math.round(gross/revenue*10000)/100,
   rows,
 };
}
/** Never accept org/branch or user role from UI arguments. */
export function listAuthorizedBillOriginalGrossProfit(
 from?:string,to?:string,
):BillOriginalGrossProfitReport {
 assertPermission("accounting.view");
 const branch=getActiveBranch();
 return calculateBillOriginalGrossProfit(listSales().filter(sale=>
   sale.branchId==null||(branch!=null&&sale.branchId===branch.id)),from,to);
}
