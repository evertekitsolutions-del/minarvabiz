/**
 * SAL-003 recoverable archive for non-financial order intents.
 * Never archive a confirmed or invoiced sale: financial reversal/credit note
 * must go through the future authoritative writer, not hidden Trash.
 */
import type { SalesOrderIntent, SalesOrderAuthorizedScope } from "./sales-order-intent";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export interface SalesOrderArchiveRequest {
 readonly operationId: string;
 readonly expectedVersion: number;
 readonly occurredAt: string;
 readonly action: "archive" | "restore";
}
export function planSalesOrderArchive(
 order: SalesOrderIntent,
 request: SalesOrderArchiveRequest,
 auth: SalesOrderAuthorizedScope,
 enabled=false,
): {disposition:"update"|"replay";order:SalesOrderIntent} {
 if (enabled!==true) throw Error("SAL-003 archive feature is disabled");
 if (!auth?.canManageSalesOrders) throw Error("Sales-order archive permission denied");
 verifySalesOrderRecordIntegrity(order);
 for(const field of ["organizationId","companyId","branchId","warehouseId"] as const)
  if(order[field]!==auth[field]) throw Error("Sales-order archive scope mismatch");
 if (!request || !UUID.test(request.operationId) ||
   typeof request.occurredAt!=="string" ||
   !Number.isFinite(Date.parse(request.occurredAt)) ||
   new Date(request.occurredAt).toISOString()!==request.occurredAt ||
   !["archive","restore"].includes(request.action)) throw Error("Invalid sales-order archive operation");
 if (order.status!=="draft" && order.status!=="cancelled")
   throw Error("Confirmed or invoiced sales orders cannot be archived or restored");
 if (request.operationId===order.lastOperationId) {
  const same=request.action==="archive"
   ? order.deletedAt===request.occurredAt
   : order.deletedAt===null && order.updatedAt===request.occurredAt;
  if(same) return {disposition:"replay",order};
  throw Error("Sales-order archive operation key reused for a different action");
 }
 if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion!==order.version)
   throw Error("Stale sales-order archive version");
 if (request.occurredAt<order.updatedAt) throw Error("Sales-order archive timestamp moved backwards");
 if(request.action==="archive" && order.deletedAt) throw Error("Sales order already archived");
 if(request.action==="restore" && !order.deletedAt) throw Error("Sales order is not archived");
 if(order.version>=Number.MAX_SAFE_INTEGER) throw Error("Sales-order archive version exhausted");
 return {disposition:"update",order:{
   ...order, deletedAt:request.action==="archive"?request.occurredAt:null,
   version:order.version+1,updatedAt:request.occurredAt,
   lastOperationId:request.operationId,
 }};
}
