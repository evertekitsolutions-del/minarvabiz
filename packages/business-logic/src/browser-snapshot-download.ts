/**
 * Fail-closed browser download preparation for the *current local shared-core*
 * business snapshot. This is NOT an authenticated server/Supabase export and
 * MUST NOT be described as a complete hosted tenant backup.
 */
const REQUIRED_COLLECTIONS = [
  "customers", "products", "categories", "sales", "payments", "orders",
  "measurements", "laundry", "expenses", "purchases", "suppliers",
  "expenseCategories", "staff", "assignments", "incentiveRules", "payouts",
  "notifications", "returns", "audit", "branches",
] as const;

export interface BrowserSnapshotDownload {
  filename: string;
  content: string;
  mediaType: "application/json";
  recordCounts: Record<string, number>;
}

/**
 * Do not "upgrade" old/partial backup payloads with default empty arrays:
 * accepting a partial export as a current full snapshot could lose data on
 * later restore. The authoritative import validator runs separately in UI.
 */
export function prepareBrowserSnapshotDownload(
  content: string,
  expectedVersion: number,
  capturedAt: Date = new Date(),
): BrowserSnapshotDownload {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("No business data snapshot was generated");
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Invalid expected snapshot version");
  }
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The business snapshot must be an object");
  }
  const source = parsed as Record<string, unknown>;
  if (source.version !== expectedVersion) {
    throw new Error("Snapshot schema version mismatch");
  }
  if (typeof source.exportedAt !== "string" ||
      !Number.isFinite(Date.parse(source.exportedAt))) {
    throw new Error("Snapshot timestamp is missing or invalid");
  }
  const recordCounts: Record<string, number> = {};
  for (const field of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(source[field])) {
      throw new Error("Incomplete business snapshot: " + field + " is missing");
    }
    recordCounts[field] = (source[field] as unknown[]).length;
  }
  if (!Number.isFinite(capturedAt.getTime())) throw new Error("Invalid download time");
  const timestamp = capturedAt.toISOString().replace(/[:.]/g, "-");
  return {
    filename: "minarvabiz-local-business-snapshot-v" + expectedVersion + "-" + timestamp + ".json",
    content,
    mediaType: "application/json",
    recordCounts,
  };
}

/** A bounded browser file-read limit; larger datasets must be inspected via desktop tools. */
export const MAX_BROWSER_SNAPSHOT_VERIFY_BYTES = 128 * 1024 * 1024;

export interface BrowserSnapshotInspection {
  version: number;
  exportedAt: string;
  recordCounts: Record<string, number>;
  sections: {
    accounting: boolean;
    warehouse: boolean;
    procurement: boolean;
    taxConfig: boolean;
    shopProfile: boolean;
    outbox: boolean;
  };
}

/**
 * Inspect a user-selected local v15 snapshot without importing or mutating
 * business state. Ensures this is not one of the old partial Web archives.
 * Caller must separately run the shared-core import validator: structural
 * inspection does not prove independent recovery or cloud completeness.
 */
export function inspectBrowserSnapshotForRecovery(
  content: string,
  expectedVersion: number,
  byteSize: number,
): BrowserSnapshotInspection {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 ||
      byteSize > MAX_BROWSER_SNAPSHOT_VERIFY_BYTES) {
    throw new Error("Snapshot file is empty, invalid or exceeds the 128 MiB browser verification limit");
  }
  let prepared: BrowserSnapshotDownload;
  try {
    prepared = prepareBrowserSnapshotDownload(content, expectedVersion);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Snapshot is not valid JSON");
    throw error;
  }
  // The export helper already enforced all mandatory v15 collections.
  const snapshot = JSON.parse(prepared.content) as Record<string, unknown>;
  return {
    version: expectedVersion,
    exportedAt: snapshot.exportedAt as string,
    recordCounts: prepared.recordCounts,
    sections: {
      accounting: snapshot.accounting != null,
      warehouse: snapshot.warehouse != null,
      procurement: snapshot.procurement != null,
      taxConfig: snapshot.taxConfig != null,
      shopProfile: snapshot.shopProfile != null,
      outbox: Array.isArray(snapshot.outbox),
    },
  };
}
