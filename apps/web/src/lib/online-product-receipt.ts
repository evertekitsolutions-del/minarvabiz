/** Pure, network-independent contract for an acknowledged tenant-scoped product revision. */
export const productCloudColumns = [
  "name", "sku", "barcode", "category_id", "unit", "cost_price",
  "selling_price", "stock_quantity", "minimum_stock", "is_active",
] as const;

function fieldMatches(actual: unknown, expected: unknown): boolean {
  if (expected == null) return actual == null;
  if (typeof expected === "number") {
    return (typeof actual === "number" || (typeof actual === "string" && actual.trim() !== ""))
      && Number(actual) === expected;
  }
  return actual === expected;
}

/** HTTP success or matching ID/version alone is not evidence of a durable save. */
export function matchesProductCloudReceipt(
  actual: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
  id: string,
  orgId: string,
  version: number,
): boolean {
  if (!actual || actual.id !== id || actual.org_id !== orgId ||
      Number(actual.version) !== version || actual.deleted_at != null) return false;
  return productCloudColumns.every(key =>
    Object.prototype.hasOwnProperty.call(expected, key)
      ? fieldMatches(actual[key], expected[key]) : true
  );
}
