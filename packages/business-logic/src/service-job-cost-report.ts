/**
 * SVC-013 — read-only service-job cost reconciliation and estimated profit band.
 * Never post inventory, taxes, payment, GL or claim realized/statutory profit.
 * Service order price is net listed order value (not verified cash received).
 * Recorded field parts may already be contained in existing order-level costs.
 * We therefore give a range rather than double count unknown cost overlap.
 */
import type {ServiceOrder} from "@minarvabiz/types";
import {addMinorUnits,toMinorUnits,subtractMinorUnits} from "@minarvabiz/utils";
import type {ServiceSiteVisit} from "./service-site-visit-register";
import {summarizeServiceVisitParts} from "./service-visit-parts";

export interface ServiceJobCostRow{
  readonly orderId:string;
  readonly orderNumber:string;
  readonly customerName:string;
  readonly serviceType:string;
  readonly status:string;
  readonly visitCount:number;
  readonly partLineCount:number;
  readonly correctedPartLines:number;
  readonly orderPriceMinor:number;
  readonly existingMaterialCostMinor:number;
  readonly existingExpenseCostMinor:number;
  readonly partsUsedCostMinor:number;
  /** Worst case: no recorded parts were already included in the order costs. */
  readonly lowerEstimatedProfitMinor:number;
  /** Best case: all recorded parts were already included in the order costs. */
  readonly upperEstimatedProfitMinor:number;
  readonly lowerMarginPercent:number|null;
  readonly upperMarginPercent:number|null;
}
export interface ServiceJobCostReport{
  readonly jobCount:number;
  readonly visitCount:number;
  readonly excludedVisitCount:number;
  readonly totalOrderValueMinor:number;
  readonly existingCostsMinor:number;
  readonly recordedPartsCostMinor:number;
  readonly lowerEstimatedProfitMinor:number;
  readonly upperEstimatedProfitMinor:number;
  readonly rows:ServiceJobCostRow[];
}
function money(value:unknown,label:string):number{
  if(typeof value!=="number"||!Number.isFinite(value)||value<0)
    throw new Error("Invalid job "+label);
  return toMinorUnits(value);
}
function validOrder(o:ServiceOrder):void{
  if(!o||typeof o.id!=="string"||!o.id||typeof o.orderNumber!=="string"||
    !o.orderNumber||typeof o.status!=="string")
    throw new Error("Invalid job order");
}
function pct(n:number,d:number):number|null{
  return d===0?null:Math.round(n/d*10000)/100;
}
/**
 * Pure projection of already-authorized, branch-scoped source records.
 * One order net price is included ONCE even across many technician visits.
 * "Cancelled" and soft-deleted orders are excluded from a sales estimate.
 */
export function calculateServiceJobCostReport(
  orders:readonly ServiceOrder[],visits:readonly ServiceSiteVisit[],
):ServiceJobCostReport{
  if(!Array.isArray(orders)||!Array.isArray(visits)||
    orders.length>10000||visits.length>10000)throw new Error("Invalid job report inputs");
  const ordersById=new Map<string,ServiceOrder>();
  for(const o of orders){
    validOrder(o);
    if(ordersById.has(o.id))throw new Error("Duplicate job order");
    ordersById.set(o.id,o);
  }
  const groups=new Map<string,{order:ServiceOrder;visits:ServiceSiteVisit[]}>();
  const seenVisits=new Set<string>(),seenParts=new Set<string>();
  let excludedVisitCount=0;
  for(const visit of visits){
    if(!visit||typeof visit.id!=="string"||!visit.id||
       typeof visit.orderId!=="string"||typeof visit.branchId!=="string"||
       !["scheduled","arrived","completed","cancelled"].includes(visit.status))
      throw new Error("Invalid job site visit");
    if(seenVisits.has(visit.id))throw new Error("Duplicate job site visit");
    seenVisits.add(visit.id);
    const order=ordersById.get(visit.orderId);
    if(!order||order.deletedAt||order.status==="cancelled"||visit.status==="cancelled"){
      excludedVisitCount++;continue;
    }
    if(!order.branchId||order.branchId!==visit.branchId)
      throw new Error("Service report branch mismatch");
    const group=groups.get(order.id)??{order,visits:[]};
    group.visits.push(visit);
    groups.set(order.id,group);
  }
  const rows:ServiceJobCostRow[]=[];
  for(const {order,visits:jobVisits} of groups.values()){
    const orderPriceMinor=money(order.price,"net order value");
    const existingMaterialCostMinor=money(order.externalMaterialCost,"material cost");
    const existingExpenseCostMinor=money(order.orderExpensesTotal,"direct expense");
    let partsUsedCostMinor=0,partLineCount=0,correctedPartLines=0;
    for(const visit of jobVisits){
      for(const part of visit.parts??[]){
        if(seenParts.has(part.id))throw new Error("Duplicate service part counted in job report");
        seenParts.add(part.id);
      }
      const p=summarizeServiceVisitParts(visit.parts??[]);
      partsUsedCostMinor=addMinorUnits(partsUsedCostMinor,p.totalCostMinor);
      partLineCount+=p.usedCount;
      correctedPartLines+=p.voidedCount;
    }
    const baseline=addMinorUnits(existingMaterialCostMinor,existingExpenseCostMinor);
    const upperEstimatedProfitMinor=subtractMinorUnits(orderPriceMinor,baseline);
    const lowerEstimatedProfitMinor=subtractMinorUnits(upperEstimatedProfitMinor,partsUsedCostMinor);
    rows.push({orderId:order.id,orderNumber:order.orderNumber,
      customerName:order.customerName??order.customerId,
      serviceType:order.serviceType,status:order.status,
      visitCount:jobVisits.length,partLineCount,correctedPartLines,orderPriceMinor,
      existingMaterialCostMinor,existingExpenseCostMinor,partsUsedCostMinor,
      lowerEstimatedProfitMinor,upperEstimatedProfitMinor,
      lowerMarginPercent:pct(lowerEstimatedProfitMinor,orderPriceMinor),
      upperMarginPercent:pct(upperEstimatedProfitMinor,orderPriceMinor)});
  }
  rows.sort((a,b)=>a.lowerEstimatedProfitMinor-b.lowerEstimatedProfitMinor||
    a.orderNumber.localeCompare(b.orderNumber)||a.orderId.localeCompare(b.orderId));
  let totalOrderValueMinor=0,existingCostsMinor=0,recordedPartsCostMinor=0,
    lowerEstimatedProfitMinor=0,upperEstimatedProfitMinor=0,visitCount=0;
  for(const row of rows){
    totalOrderValueMinor=addMinorUnits(totalOrderValueMinor,row.orderPriceMinor);
    existingCostsMinor=addMinorUnits(existingCostsMinor,row.existingMaterialCostMinor,
      row.existingExpenseCostMinor);
    recordedPartsCostMinor=addMinorUnits(recordedPartsCostMinor,row.partsUsedCostMinor);
    lowerEstimatedProfitMinor=addMinorUnits(lowerEstimatedProfitMinor,row.lowerEstimatedProfitMinor);
    upperEstimatedProfitMinor=addMinorUnits(upperEstimatedProfitMinor,row.upperEstimatedProfitMinor);
    visitCount+=row.visitCount;
  }
  return {jobCount:rows.length,visitCount,excludedVisitCount,totalOrderValueMinor,
    existingCostsMinor,recordedPartsCostMinor,
    lowerEstimatedProfitMinor,upperEstimatedProfitMinor,rows};
}
function csvText(raw:string):string{
  const v=/^[\s]*[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+v.replace(/"/g,'""')+'"';
}
export function exportServiceJobCostReportCsv(report:ServiceJobCostReport):string{
  const h=["Order number","Customer","Order status","Visits","Active part lines",
    "Corrected part lines","Net order value","Recorded order material cost",
    "Recorded order direct expenses","Parts-used cost (overlap uncertain)",
    "Lower margin estimate","Upper margin estimate","Lower margin %",
    "Upper margin %"];
  const rows=report.rows.map(r=>[
    r.orderNumber,r.customerName,r.status,String(r.visitCount),
    String(r.partLineCount),String(r.correctedPartLines),
    (r.orderPriceMinor/100).toFixed(2),(r.existingMaterialCostMinor/100).toFixed(2),
    (r.existingExpenseCostMinor/100).toFixed(2),(r.partsUsedCostMinor/100).toFixed(2),
    (r.lowerEstimatedProfitMinor/100).toFixed(2),(r.upperEstimatedProfitMinor/100).toFixed(2),
    r.lowerMarginPercent===null?"":r.lowerMarginPercent.toFixed(2),
    r.upperMarginPercent===null?"":r.upperMarginPercent.toFixed(2),
  ].map(csvText).join(","));
  return [h.map(csvText).join(","),...rows].join("\r\n")+"\r\n";
}
