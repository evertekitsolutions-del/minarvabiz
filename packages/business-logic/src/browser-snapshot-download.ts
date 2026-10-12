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
