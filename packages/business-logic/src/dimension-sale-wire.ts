/**
 * UBP-05f — pure dimensional sale RPC field serializer.
 * No network call, financial replay or server capability inference.
 * Must be attached only to a deployment-gated authenticated atomic writer.
 */
import { toQuantityMilli, QUANTITY_MILLI_FACTOR } from "@minarvabiz/utils";
import {
  parseDimensionLineMetadata,
  type PersistableDimensionLineV1,
} from "./dimensional-billing";

export interface DimensionSaleWireSource {
  readonly quantity: number;
  readonly dimensionMetadata?: unknown;
}

/**
 * The only allowed camelCase -> snake_case conversion for area audit records.
 * Rejects prepopulated snake_case keys to prevent shape confusion / bypass.
 * No extra properties from the untrusted source are copied into the RPC.
 */
export function serializeDimensionSaleLine(
  line: DimensionSaleWireSource,
): Readonly<{ dimension_metadata?: Readonly<PersistableDimensionLineV1> }> {
  if (!line || typeof line !== "object" || Array.isArray(line)) {
    throw new Error("Dimension sale line must be an object");
  }
  if (Object.hasOwn(line, "dimension_metadata")) {
    throw new Error("Prepopulated dimension_metadata is not permitted");
  }
  if (line.dimensionMetadata == null) return Object.freeze({});
  const milli = toQuantityMilli(line.quantity);
  if (!Number.isFinite(line.quantity) ||
      Math.abs(milli / QUANTITY_MILLI_FACTOR - line.quantity) > 1e-9) {
    throw new Error("Dimension sale quantity must have at most 3 decimals");
  }
  return Object.freeze({
    dimension_metadata: parseDimensionLineMetadata(line.dimensionMetadata, milli),
  });
}
