/**
 * A protocol marker is returned only by the authenticated, read-only
 * server RPC installed after the canonical atomic dimensional sale migration.
 * Not a substitute for PostgreSQL's tenant/branch/stock authorization.
 */
export function requireDimensionSaleCapability(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Dimensional cloud sale RPC is unavailable");
  }
  const capability = input as Record<string, unknown>;
  if (Object.keys(capability).length !== 2 ||
      capability.protocol !== "dimension-sale-v1" ||
      capability.schemaVersion !== 1) {
    throw new Error("Incompatible dimensional cloud sale protocol");
  }
}

/** Reject success-shaped responses without the exact committed sale identity. */
export function requireDimensionSaleReceipt(input: unknown, expectedSaleId: string): void {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !expectedSaleId) throw new Error("Missing atomic dimensional sale receipt");
  const result = input as Record<string, unknown>;
  if (Object.keys(result).length !== 2 ||
      result.sale_id !== expectedSaleId ||
      typeof result.idempotent !== "boolean") {
    throw new Error("Atomic dimensional sale receipt identity mismatch");
  }
}
