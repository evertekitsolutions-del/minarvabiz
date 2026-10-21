/**
 * FIN-027 service-specific margin for DELIVERED tailoring/service orders.
 * Existing order.price is the already-discounted net order value. Material
 * cost and orderExpensesTotal are current recorded direct costs. Other cost
 * categories, salary allocation and separate tax returns are not included.
 */
import type { ServiceOrder, ServiceType } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits, subtractMinorUnits } from "@minarvabiz/utils";
import { SERVICE_TYPE_LABELS } from "./orders";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listOrders } from "./orders-store";

export interface ServiceOriginalGrossMarginRow {
  serviceType: ServiceType;
  serviceName: string;
  deliveredOrderCount: number;
  orderRevenue: number;
  recordedMaterialCost: number;
  recordedDirectExpenses: number;
  estimatedGrossProfit: number;
  estimatedMarginPercent: number;
}

function checkDay(value?:string):string|null {
  if (value==null || value==="") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid service profitability date");
  const date=new Date(value+"T00:00:00.000Z");
  if (!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value){
    throw new Error("Invalid service profitability date");
  }
  return value;
}

/** Pure, already-scoped operational direct-cost margin by service type. */
export function calculateServiceOriginalGrossMargins(
  orders: readonly ServiceOrder[], from?:string,to?:string,
): ServiceOriginalGrossMarginRow[] {
  const start=checkDay(from),end=checkDay(to);
  if (start && end && start>end) throw new Error("Service report start date exceeds end date");
  const grouped=new Map<ServiceType,{
    count:number;revenue:number;materials:number;expenses:number;
  }>();
  for(const order of orders){
    if (order.deletedAt || order.status!=="delivered") continue;
    if (!SERVICE_TYPE_LABELS[order.serviceType] ||
      typeof order.orderDate!=="string" ||
      !/^\d{4}-\d{2}-\d{2}/.test(order.orderDate)) {
      throw new Error("Delivered service order has invalid type or date");
    }
    const d=order.orderDate.slice(0,10);
    if(start && d<start || end && d>end)continue;
    if(!Number.isFinite(order.price)||order.price<0||
      !Number.isFinite(order.externalMaterialCost)||order.externalMaterialCost<0||
      !Number.isFinite(order.orderExpensesTotal)||order.orderExpensesTotal<0){
      throw new Error("Service order price or direct costs are invalid");
    }
    const current=grouped.get(order.serviceType)??{
      count:0,revenue:0,materials:0,expenses:0,
    };
    current.count+=1;
    current.revenue=addMinorUnits(current.revenue,toMinorUnits(order.price));
    current.materials=addMinorUnits(current.materials,toMinorUnits(order.externalMaterialCost));
    current.expenses=addMinorUnits(current.expenses,toMinorUnits(order.orderExpensesTotal));
    grouped.set(order.serviceType,current);
  }
  return [...grouped].map(([serviceType,g])=>{
    const gross=subtractMinorUnits(g.revenue,addMinorUnits(g.materials,g.expenses));
    return{
      serviceType,serviceName:SERVICE_TYPE_LABELS[serviceType],
      deliveredOrderCount:g.count,orderRevenue:fromMinorUnits(g.revenue),
      recordedMaterialCost:fromMinorUnits(g.materials),
      recordedDirectExpenses:fromMinorUnits(g.expenses),
      estimatedGrossProfit:fromMinorUnits(gross),
      estimatedMarginPercent:g.revenue===0?0:Math.round(gross/g.revenue*10000)/100,
    };
  }).sort((a,b)=>b.estimatedGrossProfit-a.estimatedGrossProfit||
    a.serviceName.localeCompare(b.serviceName));
}

/** Current authorized branch, not tenant/company values supplied by UI. */
export function listAuthorizedServiceOriginalGrossMargins(
  from?:string,to?:string,
): ServiceOriginalGrossMarginRow[] {
  assertPermission("accounting.view");
  const branch=getActiveBranch();
  return calculateServiceOriginalGrossMargins(
    listOrders().filter(order=>order.branchId==null||
      (branch!=null && order.branchId===branch.id)),from,to);
}
