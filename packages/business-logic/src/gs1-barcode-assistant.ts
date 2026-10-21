/**
 * Retail catalog — barcode standards assistant (read-only).
 * Builds on Open Mercato MIT GTIN checks; it never replaces Code128/QR,
 * inventory, product identity, or physical barcode-scanner verification.
 */
import {
  computeGs1CheckDigit,
  isValidGtin,
  normalizeGtinValue,
} from "./vendor/open-mercato/gtin";

export type Gs1BarcodeType = "ean13" | "ean8" | "upc";
export interface Gs1BarcodeInspection {
  readonly kind: Gs1BarcodeType;
  readonly normalizedInput: string;
  readonly valid: boolean;
  readonly generated: boolean;
  readonly completeCode: string;
  readonly expectedCheckDigit: number | null;
  readonly explanation: string;
}
const BODY_LENGTH: Record<Gs1BarcodeType,number> = {ean13:12,ean8:7,upc:11};

/**
 * Works with *human-typed* barcodes. The UI does not change product records,
 * printed labels, or warehouse/counter barcode authority.
 */
export function inspectGs1Barcode(raw: string, kind: Gs1BarcodeType): Gs1BarcodeInspection {
  if (!Object.prototype.hasOwnProperty.call(BODY_LENGTH,kind) ||
      typeof raw !== "string" || raw.length > 80) {
    throw new Error("Choose EAN-13, EAN-8 or UPC-A and enter a barcode");
  }
  const normalizedInput = normalizeGtinValue(kind,raw);
  const length=BODY_LENGTH[kind];
  if(!/^\d+$/.test(normalizedInput) ||
     (normalizedInput.length!==length && normalizedInput.length!==length+1)){
    throw new Error("Barcode must contain "+length+" or "+(length+1)+" digits, without letters");
  }
  const generated=normalizedInput.length===length;
  const check=computeGs1CheckDigit(normalizedInput.slice(0,length));
  const completeCode=generated ? normalizedInput+String(check) : normalizedInput;
  const valid=generated || isValidGtin(kind,normalizedInput);
  return {
    kind,normalizedInput,generated,valid,completeCode,
    expectedCheckDigit:check,
    explanation:generated
      ? "Check digit generated; confirm the product manufacturer assigned this prefix before printing"
      : valid
        ? "Barcode has a valid GS1 check digit; this does not verify ownership or uniqueness"
        : "Invalid check digit. Expected "+check+" as the last digit.",
  };
}
