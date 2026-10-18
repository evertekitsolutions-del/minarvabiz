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
