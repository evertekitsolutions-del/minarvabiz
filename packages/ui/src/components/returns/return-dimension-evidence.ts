import type { SaleItem } from "@minarvabiz/types";
import { parseDimensionLineMetadata } from "@minarvabiz/business-logic";
import { toQuantityMilli } from "@minarvabiz/utils";

export type ReturnDimensionEvidence =
  | Readonly<{ status: "valid"; label: string }>
  | Readonly<{ status: "invalid"; label: string }>;

const corrupt = Object.freeze({
  status: "invalid" as const,
  label: "Invalid recorded area — refund blocked",
});

/**
 * Read-only label derived from the saved invoice, not editable return fields.
 * Validation is independent of (and never replaces) the financial return
 * authorization in quoteSaleReturn.
 */
export function formatReturnDimensionEvidence(item: SaleItem): ReturnDimensionEvidence | null {
  if (!item || typeof item !== "object") return corrupt;
  if (Object.hasOwn(item, "dimension_metadata")) return corrupt;
  if (item.dimensionMetadata == null) return null;
  try {
    const milli = toQuantityMilli(item.quantity);
    if (!Number.isFinite(item.quantity) ||
        Math.abs(milli / 1000 - item.quantity) > 1e-9) {
      return corrupt;
    }
    const m = parseDimensionLineMetadata(item.dimensionMetadata, milli);
    return Object.freeze({
      status: "valid",
      label: `Recorded area: ${m.length} ${m.lengthUnit} × ${m.width} ${m.widthUnit} × ${m.pieces} pcs = ${m.quantityMilli / 1000} ${m.billableUnit}`,
    });
  } catch {
    return corrupt;
  }
}
