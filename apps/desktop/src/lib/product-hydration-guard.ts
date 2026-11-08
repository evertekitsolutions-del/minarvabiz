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
