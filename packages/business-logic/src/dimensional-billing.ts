/**
 * UBP-05a — pure, deterministic area quantity preflight for dimensional POS.
 * Length is parsed from strings into integer picometres, preventing floating
 * point drift before half-up rounding to the existing 0.001 quantity unit.
 * Not a pricing, tax, stock reservation or journal posting authority.
 */
export type DimensionUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type BillableAreaUnit = 'sqft' | 'sqm';

export interface DimensionAreaInput {
  readonly length: string;
  readonly width: string;
  readonly lengthUnit: DimensionUnit;
  readonly widthUnit: DimensionUnit;
  readonly billableUnit: BillableAreaUnit;
  readonly pieces?: number;
}
export interface DimensionAreaResult {
  /** Existing POS inventory uses integer thousandths of the billable unit. */
  readonly quantityMilli: number;
  readonly quantity: number;
  readonly billableUnit: BillableAreaUnit;
  readonly pieces: number;
}

// Picometres per dimension unit. Each conversion is exact and divisible by 10^6.
const PICO_PER_UNIT: Readonly<Record<DimensionUnit, bigint>> = Object.freeze({
  mm: 1_000_000_000n,
  cm: 10_000_000_000n,
  m: 1_000_000_000_000n,
  in: 25_400_000_000n,
  ft: 304_800_000_000n,
});
const BILLABLE_EDGE: Readonly<Record<BillableAreaUnit, bigint>> = Object.freeze({
  sqft: PICO_PER_UNIT.ft,
  sqm: PICO_PER_UNIT.m,
});

function parseLength(value: unknown, unit: unknown): bigint {
  if (typeof unit !== 'string' || !Object.hasOwn(PICO_PER_UNIT, unit)) {
    throw new Error('Invalid dimension unit');
  }
  if (typeof value !== 'string' || !/^[0-9]{1,9}(?:\.[0-9]{1,6})?$/.test(value)) {
    throw new Error('Invalid dimension');
  }
  const [whole, part = ''] = value.split('.');
  const scaled = BigInt(whole) * 1_000_000n + BigInt(part.padEnd(6, '0') || '0');
  if (scaled <= 0n) throw new Error('Invalid dimension');
  return scaled * PICO_PER_UNIT[unit as DimensionUnit] / 1_000_000n;
}

export function calculateDimensionArea(input: DimensionAreaInput): Readonly<DimensionAreaResult> {
  if (!input || typeof input !== 'object') throw new Error('Invalid dimension');
  const lengthPm = parseLength(input.length, input.lengthUnit);
  const widthPm = parseLength(input.width, input.widthUnit);
  if (typeof input.billableUnit !== 'string' || !Object.hasOwn(BILLABLE_EDGE, input.billableUnit)) {
    throw new Error('Invalid billable area unit');
  }
  const pieces = input.pieces ?? 1;
  if (!Number.isSafeInteger(pieces) || pieces <= 0 || pieces > 1_000_000) {
    throw new Error('Invalid piece count');
  }
  const edge = BILLABLE_EDGE[input.billableUnit];
  const denominator = edge * edge;
  const numerator = lengthPm * widthPm * BigInt(pieces) * 1000n;
  const quantity = (numerator + denominator / 2n) / denominator;
  if (quantity === 0n) throw new Error('Billable area rounds to zero');
  if (quantity > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Quantity outside supported range');
  }
  const quantityMilli = Number(quantity);
  return Object.freeze({ quantityMilli, quantity: quantityMilli / 1000, billableUnit: input.billableUnit, pieces });
}

/** Raw controlled form state; empty fields remain editable without numeric coercion. */
export interface DimensionRowDraft {
  readonly length: string;
  readonly width: string;
  readonly lengthUnit: DimensionUnit;
  readonly widthUnit: DimensionUnit;
  readonly billableUnit: BillableAreaUnit;
  readonly pieces: string;
}
export type DimensionMeasurement = Readonly<DimensionAreaInput & DimensionAreaResult & {
  readonly algorithm: 'area-v1';
}>;
export type DimensionRowPreview =
  | Readonly<{ valid: true; measurement: DimensionMeasurement }>
  | Readonly<{ valid: false; error: string }>;

/** Advisory form preview only; invalid edits never return a previous quantity. */
export function previewDimensionRow(draft: DimensionRowDraft): DimensionRowPreview {
  try {
    if (!draft || typeof draft.pieces !== 'string' || !/^[0-9]{1,7}$/.test(draft.pieces)) {
      throw new Error('Enter a whole piece count from 1 to 1000000');
    }
    const pieces = Number(draft.pieces);
    const input: DimensionAreaInput = {
      length: draft.length, width: draft.width, lengthUnit: draft.lengthUnit,
      widthUnit: draft.widthUnit, billableUnit: draft.billableUnit, pieces,
    };
    const result = calculateDimensionArea(input);
    return Object.freeze({ valid: true, measurement: Object.freeze({
      ...input, ...result, algorithm: 'area-v1' as const,
    }) });
  } catch (error) {
    return Object.freeze({ valid: false, error: error instanceof Error ? error.message : 'Invalid dimensions' });
  }
}


/**
 * UBP-05b — canonical audit metadata for a future sale_items measurement column.
 * This is data validation, not checkout/stock/RLS authority. The calling sale
 * boundary must pass its exact sale-line quantity in integer thousandths.
 */
export interface PersistableDimensionLineV1 {
  readonly schema: 'dimension-line-v1';
  readonly algorithm: 'area-v1';
  readonly length: string;
  readonly width: string;
  readonly lengthUnit: DimensionUnit;
  readonly widthUnit: DimensionUnit;
  readonly billableUnit: BillableAreaUnit;
  readonly pieces: number;
  readonly quantityMilli: number;
}

const DIMENSION_LINE_KEYS = Object.freeze([
  'schema', 'algorithm', 'length', 'width', 'lengthUnit', 'widthUnit',
  'billableUnit', 'pieces', 'quantityMilli',
] as const);
const MAX_SQL_QUANTITY_MILLI = 99_999_999_999_999; // NUMERIC(14,3)

/**
 * Recompute rather than trusting persisted or network-provided quantity.
 * Reject extra/legacy keys instead of silently discarding unknown algorithm
 * versions. Existing ordinary lines have no metadata and are unaffected.
 */
export function parseDimensionLineMetadata(
  payload: unknown,
  expectedQuantityMilli?: number,
): Readonly<PersistableDimensionLineV1> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dimension line metadata must be an object');
  }
  const prototype = Object.getPrototypeOf(payload);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid dimension line metadata prototype');
  }
  const record = payload as Record<string, unknown>;
  const fields = Object.keys(record);
  if (fields.length !== DIMENSION_LINE_KEYS.length ||
      fields.some(key => !(DIMENSION_LINE_KEYS as readonly string[]).includes(key))) {
    throw new Error('Invalid dimension line metadata fields');
  }
  // Accessor-backed values are not canonical JSON and must not be evaluated.
  if (Object.values(Object.getOwnPropertyDescriptors(record)).some(
    descriptor => !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
  )) {
    throw new Error('Invalid dimension line metadata descriptors');
  }
  if (record.schema !== 'dimension-line-v1' || record.algorithm !== 'area-v1') {
    throw new Error('Unsupported dimension line metadata version');
  }
  const quantityMilli = record.quantityMilli;
  if (!Number.isSafeInteger(quantityMilli) || (quantityMilli as number) <= 0 ||
      (quantityMilli as number) > MAX_SQL_QUANTITY_MILLI) {
    throw new Error('Dimension quantity outside sale-line precision');
  }
  if (expectedQuantityMilli !== undefined &&
      (!Number.isSafeInteger(expectedQuantityMilli) ||
       expectedQuantityMilli !== quantityMilli)) {
    throw new Error('Sale-line quantity does not match dimensions');
  }
  // Unit and decimal validation is delegated to the existing exact calculator.
  const pieces = record.pieces as number;
  const computed = calculateDimensionArea({
    length: record.length as string,
    width: record.width as string,
    lengthUnit: record.lengthUnit as DimensionUnit,
    widthUnit: record.widthUnit as DimensionUnit,
    billableUnit: record.billableUnit as BillableAreaUnit,
    pieces,
  });
  if (computed.quantityMilli !== quantityMilli) {
    throw new Error('Dimension inputs do not match stored quantity');
  }
  return Object.freeze({
    schema: 'dimension-line-v1' as const,
    algorithm: 'area-v1' as const,
    length: record.length as string,
    width: record.width as string,
    lengthUnit: record.lengthUnit as DimensionUnit,
    widthUnit: record.widthUnit as DimensionUnit,
    billableUnit: record.billableUnit as BillableAreaUnit,
    pieces,
    quantityMilli: quantityMilli as number,
  });
}

/** Normalize UI snapshot into a canonical, JSON-roundtrippable audit packet. */
export function dimensionLineMetadataFromMeasurement(
  measurement: DimensionMeasurement,
): Readonly<PersistableDimensionLineV1> {
  if (!measurement || measurement.quantity !== measurement.quantityMilli / 1000) {
    throw new Error('Measurement preview quantity is inconsistent');
  }
  return parseDimensionLineMetadata({
    schema: 'dimension-line-v1',
    algorithm: measurement.algorithm,
    length: measurement.length,
    width: measurement.width,
    lengthUnit: measurement.lengthUnit,
    widthUnit: measurement.widthUnit,
    billableUnit: measurement.billableUnit,
    pieces: measurement.pieces,
    quantityMilli: measurement.quantityMilli,
  }, measurement.quantityMilli);
}
