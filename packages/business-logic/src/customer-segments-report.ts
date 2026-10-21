/**
 * CRM-007 — reuse current deterministic RFM intelligence for the existing
 * customer list. Only issued/partial sales and DELIVERED service orders count
 * towards this historic purchasing segment; no marketing send is performed.
 */
import type { Customer } from "@minarvabiz/types";
import { getCustomerIntelligenceSnapshot, type CustomerIntelligenceProfile,
  type CustomerSegment } from "./customer-intelligence";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listCustomers, listSales } from "./store";
import { listOrders } from "./orders-store";

export interface CustomerSegmentationItem {
  readonly customerId: string;
  readonly segment: CustomerSegment;
  readonly churnRisk: CustomerIntelligenceProfile["churnRisk"];
  readonly completedTransactions: number;
  readonly totalBilled: number;
  readonly daysSinceLastTransaction: number | null;
}
export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegment,string> = {
  champion:"Champion",loyal:"Loyal",promising:"Promising",new:"New",
  at_risk:"At risk",lost:"Lost",hibernating:"Hibernating",
};

export function calculateCustomerSegments(
  customers: readonly Pick<Customer,"id"|"name"|"phone"|"createdAt">[],
  sales: readonly {customerId?:string|null;total:number;saleDate:string;status:string;deletedAt?:string|null}[],
  services: readonly {customerId:string;price:number;orderDate:string;status:string;deletedAt?:string|null}[],
  now: Date,
): CustomerSegmentationItem[] {
  if(!Number.isFinite(now.getTime())) throw new Error("Segmentation as-of date is invalid");
  const customerIds=new Set(customers.map(c=>c.id));
  const billed=[
    ...sales.filter(s=>!s.deletedAt&&["completed","partial"].includes(s.status)&&
      s.customerId&&customerIds.has(s.customerId)).map(s=>({
        customerId:s.customerId as string,total:s.total,date:s.saleDate,status:"delivered",
      })),
    ...services.filter(o=>!o.deletedAt&&o.status==="delivered"&&
      customerIds.has(o.customerId)).map(o=>({
        customerId:o.customerId,total:o.price,date:o.orderDate,status:"delivered",
      })),
  ];
  if(billed.some(row=>!Number.isFinite(row.total)||row.total<0)) {
    throw new Error("Segmentation source has an invalid issued invoice total");
  }
  const snapshot=getCustomerIntelligenceSnapshot(customers.map(c=>({
    id:c.id,name:c.name,phone:c.phone,createdAt:c.createdAt,
  })),billed,now);
  return snapshot.customers.map(p=>({
    customerId:p.customerId,segment:p.segment,churnRisk:p.churnRisk,
    completedTransactions:p.completedOrders,totalBilled:p.totalSpend,
    daysSinceLastTransaction:p.daysSinceLastOrder,
  }));
}

/** Domain authorization and branch are derived from the local host context. */
export function listAuthorizedCustomerSegments(now=new Date()):CustomerSegmentationItem[]{
  assertPermission("customers.manage");
  const branch=getActiveBranch();
  const scoped=<T extends {branchId?:string|null}>(items:readonly T[])=>
    items.filter(x=>x.branchId==null||(branch!=null&&x.branchId===branch.id));
  const customers=scoped(listCustomers());
  return calculateCustomerSegments(customers,scoped(listSales()),scoped(listOrders()),now);
}
