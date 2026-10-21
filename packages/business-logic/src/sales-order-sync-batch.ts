/**
 * SAL-003 ordered, bounded offline-cloud upload plan.
 *
 * Reads isolated durable SQLite order events and locally verified receipts;
 * NEVER sends a request, claims server authorization or ACKs an event.
 * Only an authenticated host may post this batch to the authoritative cloud
 * transactional writer. Event payload is original and not modified.
 */
import type { SalesOrderAuthorizedScope } from "./sales-order-intent";
import type { SalesOrderPilotEvent, SalesOrderSqliteDb } from "./sales-order-sqlite";
import { listSalesOrderEventHistorySqlite, listSalesOrdersSqlite, listArchivedSalesOrdersSqlite } from "./sales-order-sqlite";
import { listSalesOrderCloudReceiptsSqlite } from "./sales-order-sync-receipt-sqlite";

export interface SalesOrderUploadBatch {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly events: readonly SalesOrderPilotEvent[];
}
export interface SalesOrderBatchLimits {
  readonly maxEvents?: number;
  readonly maxBytes?: number;
}
function allowed(auth: SalesOrderAuthorizedScope, enabled: boolean): void {
  if (enabled !== true) throw new Error("SAL-003 cloud batch feature is disabled");
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order cloud batch permission denied");
}
export function prepareSalesOrderUploadBatchSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  limits: SalesOrderBatchLimits = {},
  enabled = false,
): SalesOrderUploadBatch {
  allowed(auth,enabled);
  const maxEvents=limits.maxEvents??50, maxBytes=limits.maxBytes??262144;
  if (!Number.isSafeInteger(maxEvents) || maxEvents<1 || maxEvents>100 ||
    !Number.isSafeInteger(maxBytes) || maxBytes<4096 || maxBytes>1048576) {
    throw new Error("Invalid SAL-003 cloud batch limits");
  }
  // Read consistent local event history and ACK proofs from one transaction.
  return db.transaction(() => {
    const events=listSalesOrderEventHistorySqlite(db,auth,true);
    const receipts=listSalesOrderCloudReceiptsSqlite(db,auth,true);
    const acked=new Set(receipts.map(receipt=>receipt.operationId));
    const expected=new Map<string,number>();
    const selected:SalesOrderPilotEvent[]=[];
    let totalBytes=0;
    const orders = [
      ...listSalesOrdersSqlite(db,auth,true),
      ...listArchivedSalesOrdersSqlite(db,auth,true),
    ];
    const byOrder=new Map(orders.map(order=>[order.id,order]));
    const lastEvent=new Map<string,SalesOrderPilotEvent>();
    for (const event of events) {
      const next=(expected.get(event.orderId)??0)+1;
      if(event.orderVersion!==next){
        throw new Error("Missing or out-of-order offline sales-order revision");
      }
      if(!byOrder.has(event.orderId)) {
        throw new Error("Orphan offline sales-order event without a current order");
      }
      expected.set(event.orderId,next);
      lastEvent.set(event.orderId,event);
    }
    // A missing final event MUST NOT make a locally committed order disappear
    // from the upload plan. Compare the latest event with the durable order.
    for(const order of orders){
      const latest=lastEvent.get(order.id);
      if(!latest || latest.orderVersion!==order.version ||
        latest.operationId!==order.lastOperationId ||
        JSON.stringify(latest.order)!==JSON.stringify(order)){
        throw new Error("Offline sales-order event lineage does not match latest durable order");
      }
    }
    const ackRevisions=new Map<string,number>();
    for(const event of events){
      const current=ackRevisions.get(event.orderId)??0;
      if(acked.has(event.operationId)){
        if(event.orderVersion!==current+1) throw new Error("Cloud ACKs have a revision gap");
        ackRevisions.set(event.orderId,current+1);
        continue;
      }
      // We may include multiple sequential events for one order; the
      // eventual cloud writer must apply/ack them in this order.
      if(selected.length>=maxEvents) break;
      const bytes=new TextEncoder().encode(JSON.stringify(event)).length;
      if(bytes>maxBytes) throw new Error("Single pending sales-order event exceeds upload limit");
      if(totalBytes+bytes>maxBytes) break;
      selected.push(event);
      totalBytes+=bytes;
    }
    return {
      schemaVersion:1,
      organizationId:auth.organizationId,companyId:auth.companyId,
      branchId:auth.branchId,warehouseId:auth.warehouseId,
      events:selected,
    };
  });
}
