/**
 * Conflict resolution strategies for Hybrid sync.
 *
 * Financial tables never auto-merge — always surface for review.
 */

import type { ConflictRecord, ConflictStrategy, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { FINANCIAL_TABLES, isFinancialTable } from "./constants";

export interface VersionedRecord {
  id: UUID;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export function compareVersions(
  local: { version: number; updatedAt: string },
  remote: { version: number; updatedAt: string }
): "local" | "remote" | "equal" | "conflict" {
  if (local.version > remote.version) return "local";
  if (remote.version > local.version) return "remote";
  const lt = new Date(local.updatedAt).getTime();
  const rt = new Date(remote.updatedAt).getTime();
  if (lt > rt) return "local";
  if (rt > lt) return "remote";
  return "equal";
}

/**
 * Soft-delete wins if one side deleted and other did not, when versions allow.
 */
export function resolveSoftDelete(
  local: VersionedRecord,
  remote: VersionedRecord
): "local" | "remote" | "conflict" {
  const localDel = Boolean(local.deletedAt);
  const remoteDel = Boolean(remote.deletedAt);
  if (localDel === remoteDel) {
    return compareVersions(local, remote) === "equal"
      ? "equal" as never
      : (compareVersions(local, remote) as "local" | "remote" | "conflict");
  }
  // Prefer the side with higher version; if equal, prefer delete
  if (local.version !== remote.version) {
    return local.version > remote.version ? "local" : "remote";
  }
  return localDel ? "local" : "remote";
}

export function createConflict(input: {
  tableName: string;
  recordId: UUID;
  local: VersionedRecord;
  remote: VersionedRecord;
  strategy?: ConflictStrategy;
}): ConflictRecord {
  const strategy: ConflictStrategy =
    input.strategy ??
    (isFinancialTable(input.tableName) ? "manual" : "last_write_wins");

  return {
    id: generateId(),
    tableName: input.tableName,
    recordId: input.recordId,
    localVersion: input.local.version,
    remoteVersion: input.remote.version,
    localPayload: { ...input.local },
    remotePayload: { ...input.remote },
    strategy,
    resolution: null,
    resolvedAt: null,
    createdAt: nowISO(),
  };
}

export function autoResolve(
  conflict: ConflictRecord
): { winner: "local" | "remote"; conflict: ConflictRecord } | { winner: null; conflict: ConflictRecord } {
  if (conflict.strategy === "manual") {
    return { winner: null, conflict };
  }
  if (conflict.strategy === "server_wins") {
    return {
      winner: "remote",
      conflict: { ...conflict, resolution: "remote", resolvedAt: nowISO() },
    };
  }
  if (conflict.strategy === "client_wins") {
    return {
      winner: "local",
      conflict: { ...conflict, resolution: "local", resolvedAt: nowISO() },
    };
  }
  // last_write_wins using versions then timestamps embedded in payloads
  const local = conflict.localPayload as unknown as VersionedRecord;
  const remote = conflict.remotePayload as unknown as VersionedRecord;
  const cmp = compareVersions(local, remote);
  if (cmp === "local" || cmp === "remote") {
    return {
      winner: cmp,
      conflict: { ...conflict, resolution: cmp, resolvedAt: nowISO() },
    };
  }
  // True simultaneous conflict → manual
  return { winner: null, conflict: { ...conflict, strategy: "manual" } };
}

export function manualResolve(
  conflict: ConflictRecord,
  choice: "local" | "remote" | "merged",
  mergedPayload?: Record<string, unknown>
): ConflictRecord {
  return {
    ...conflict,
    resolution: choice,
    resolvedAt: nowISO(),
    ...(choice === "merged" && mergedPayload
      ? { localPayload: mergedPayload }
      : {}),
  };
}

export { FINANCIAL_TABLES, isFinancialTable };
