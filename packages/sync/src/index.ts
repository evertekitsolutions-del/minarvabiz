import type { SyncQueueItem, SyncStatus, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";

export interface CreateSyncItemInput {
  tableName: string; recordId: UUID; operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>; deviceId: UUID;
}
export function createSyncQueueItem(input: CreateSyncItemInput): SyncQueueItem {
  return {
    id: generateId() as UUID, tableName: input.tableName, recordId: input.recordId,
    operation: input.operation, payload: input.payload, deviceId: input.deviceId,
    createdAt: nowISO(), attempts: 0, lastError: null, status: "pending" as SyncStatus,
  };
}
export function resolveConflict(
  local: { version: number; updatedAt: string },
  remote: { version: number; updatedAt: string }
): "local" | "remote" | "conflict" {
  if (local.version > remote.version) return "local";
  if (remote.version > local.version) return "remote";
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = new Date(remote.updatedAt).getTime();
  if (localTs > remoteTs) return "local";
  if (remoteTs > localTs) return "remote";
  return "conflict";
}
export const FINANCIAL_TABLES = new Set(["sales","sale_items","payments","orders","order_expenses","expenses","purchases","returns","invoices"]);
export function isFinancialTable(tableName: string): boolean { return FINANCIAL_TABLES.has(tableName); }
