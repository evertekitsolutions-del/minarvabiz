/**
 * SAL-003: fail-closed, read-only peer-device reconciliation preview.
 *
 * NEVER automatically apply a remote order, advance a server cursor, mark
 * local events delivered, replace invoice/stock/journal data or send network
 * requests. Authenticated hosts must establish server snapshot authenticity
 * independently before calling this planner.
 */
import type { SalesOrderAuthorizedScope, SalesOrderIntent } from "./sales-order-intent";
import type { SalesOrderSqliteDb } from "./sales-order-sqlite";
import { listArchivedSalesOrdersSqlite, listSalesOrdersSqlite,
  listSalesOrderEventHistorySqlite } from "./sales-order-sqlite";
import { listSalesOrderCloudReceiptsSqlite } from "./sales-order-sync-receipt-sqlite";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";

export interface SalesOrderPeerSnapshot {
  readonly order: SalesOrderIntent;
  /** Opaque server-issued cursor: informational ONLY; never persisted here. */
  readonly cursor: string;
}
export type VerifySalesOrderPeerSnapshot = (
  db: SalesOrderSqliteDb, snapshot: SalesOrderPeerSnapshot,
  auth: SalesOrderAuthorizedScope,
) => true;

export type SalesOrderReconciliationState =
  | "unchanged" | "unacknowledged-equal" | "remote-new"
  | "remote-ahead" | "local-ahead" | "conflict" | "remote-stale";

export interface SalesOrderReconciliationDecision {
  readonly orderId: string;
  readonly state: SalesOrderReconciliationState;
  readonly localVersion: number | null;
  readonly remoteVersion: number;
  readonly localPendingOperations: number;
  readonly reason: string;
}
export interface SalesOrderReconciliationPreview {
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly decisions: readonly SalesOrderReconciliationDecision[];
}

const SCOPE=["organizationId","companyId","branchId","warehouseId"] as const;
const CURSOR=/^[A-Za-z0-9._:/-]{1,256}$/;

/**
 * One consistent local SQLite snapshot. The host must independently verify
 * EACH remote snapshot, including that its cursor/order came from the
 * authenticated server under the current company/branch/device membership.
 */
export function previewSalesOrderPeerReconciliationSqlite(
  db: SalesOrderSqliteDb,
  peers: readonly SalesOrderPeerSnapshot[],
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  verifyRemote?: VerifySalesOrderPeerSnapshot,
): SalesOrderReconciliationPreview {
  if (enabled!==true) throw new Error("SAL-003 peer reconciliation disabled");
  if (auth?.canManageSalesOrders!==true) {
    throw new Error("Sales-order peer reconciliation permission denied");
  }
  if (typeof verifyRemote!=="function") {
    throw new Error("Trusted authoritative peer snapshot verifier required");
  }
  if (!Array.isArray(peers) || peers.length>100) {
    throw new Error("Invalid peer snapshot batch size");
  }
  return db.transaction(()=>{
    const localOrders=[
      ...listSalesOrdersSqlite(db,auth,true),
      ...listArchivedSalesOrdersSqlite(db,auth,true),
    ];
    const allEvents=listSalesOrderEventHistorySqlite(db,auth,true);
    const receipts=listSalesOrderCloudReceiptsSqlite(db,auth,true);
    const local=new Map(localOrders.map(order=>[order.id,order]));
    const acknowledged=new Set(receipts.map(receipt=>receipt.operationId));
    const pending=new Map<string,number>();
    for(const event of allEvents) {
      if (!acknowledged.has(event.operationId)) {
        pending.set(event.orderId,(pending.get(event.orderId)??0)+1);
      }
    }
    const seen=new Set<string>();
    const decisions:SalesOrderReconciliationDecision[]=[];
    for(const snapshot of peers) {
      if (!snapshot || typeof snapshot!=="object" ||
        !snapshot.order || !CURSOR.test(snapshot.cursor)) {
        throw new Error("Invalid peer snapshot/cursor");
      }
      const remote=snapshot.order;
      // Establish tenant scope first: never evaluate foreign financial
      // payloads against local integrity or expose their details to a client.
      for(const field of SCOPE) {
        if(remote[field]!==auth[field]) {
          throw new Error("Cross-scope remote sales-order snapshot denied");
        }
      }
      verifySalesOrderRecordIntegrity(remote);
      if(seen.has(remote.id)) {
        throw new Error("Duplicate remote sales-order in peer batch");
      }
      seen.add(remote.id);
      if(verifyRemote(db,snapshot,auth)!==true) {
        throw new Error("Trusted remote sales-order verification denied");
      }
      const current=local.get(remote.id);
      const count=pending.get(remote.id)??0;
      let state:SalesOrderReconciliationState;
      let reason:string;
      if(!current) {
        state="remote-new";
        reason="Remote order requires trusted master/financial dependency validation before import";
      } else if(remote.version===current.version) {
        if(JSON.stringify(remote)===JSON.stringify(current)) {
          state=count>0?"unacknowledged-equal":"unchanged";
          reason=count>0?
            "Local order matches peer but has unacknowledged financial/order operations":
            "Verified peer revision matches durable local order";
        } else {
          state="conflict";
          reason="Same revision has different order content; manual investigation required";
        }
      } else if(remote.version>current.version) {
        state=count>0?"conflict":"remote-ahead";
        reason=count>0?
          "Peer revision would overwrite pending local operations":
          "Newer verified peer revision requires authorized transactional apply";
      } else {
        state=count>0?"local-ahead":"remote-stale";
        reason=count>0?
          "Local pending revisions lead peer; upload only after server authorization":
          "Peer cursor is behind an acknowledged local revision";
      }
      decisions.push(Object.freeze({
        orderId:remote.id,state,reason,
        localVersion:current?.version??null,remoteVersion:remote.version,
        localPendingOperations:count,
      }));
    }
    return Object.freeze({
      organizationId:auth.organizationId,companyId:auth.companyId,
      branchId:auth.branchId,warehouseId:auth.warehouseId,
      decisions:Object.freeze(decisions),
    });
  });
}
