/**
 * Fail closed if a new app version silently drops persisted products while
 * hydrating a legacy SQLite snapshot. The existing database remains untouched
 * so the customer can recover from the original image.
 */
export function assertHydratedProductsPreserved(
  persisted: unknown,
  hydrated: readonly { id: string }[],
): void {
  if (!persisted || typeof persisted !== "object") return;
  const original = (persisted as { products?: unknown }).products;
  if (original === undefined) return; // Empty legacy snapshots may predate products.
  if (!Array.isArray(original)) {
    throw new Error("Persisted product records are malformed. SQLite startup blocked.");
  }
  const beforeIds = original.map((item: unknown) =>
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"
      ? (item as { id: string }).id : "",
  );
  const afterIds = hydrated.map((item) => item.id);
  const uniqueBefore = new Set(beforeIds);
  const uniqueAfter = new Set(afterIds);
  if (beforeIds.some((id) => !id) || afterIds.some((id) => !id) ||
      beforeIds.length !== uniqueBefore.size || afterIds.length !== uniqueAfter.size ||
      beforeIds.length !== afterIds.length ||
      beforeIds.some((id) => !uniqueAfter.has(id))) {
    throw new Error(
      "SQLite startup blocked: hydrated product records differ from the saved database. " +
      "The existing database has not been overwritten. Contact support.",
    );
  }
}


/**
 * Extends startup's fail-closed persistence fence beyond product records.
 * Snapshot migrations must not silently remove customer, sale or payment IDs
 * before the first full-image SQLite write replaces the existing on-disk DB.
 * This intentionally does not mutate or repair any persisted records.
 */
export function assertHydratedCoreRecordsPreserved(
  persisted: unknown,
  hydrated: { customers?: unknown; sales?: unknown; payments?: unknown },
): void {
  if (!persisted || typeof persisted !== "object") return;
  const previous = persisted as Record<string, unknown>;
  for (const collection of ["customers", "sales", "payments"] as const) {
    const original = previous[collection];
    if (original === undefined) continue; // Older snapshots can omit collections.
    if (!Array.isArray(original)) {
      throw new Error(`SQLite startup blocked: persisted ${collection} records are malformed; no data was overwritten.`);
    }
    const next = hydrated[collection];
    if (!Array.isArray(next)) {
      throw new Error(`SQLite startup blocked: hydrated ${collection} records are unavailable; no data was overwritten.`);
    }
    const ids = (rows: unknown[]): string[] => rows.map((row) =>
      row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"
        ? (row as { id: string }).id : "",
    );
    const before = ids(original);
    const after = ids(next);
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    if (before.some((id) => !id) || after.some((id) => !id)
      || beforeSet.size !== before.length || afterSet.size !== after.length
      || before.length !== after.length || before.some((id) => !afterSet.has(id))) {
      throw new Error(`SQLite startup blocked: hydrated ${collection} IDs differ from the saved database. The original database has not been overwritten.`);
    }
  }
}
