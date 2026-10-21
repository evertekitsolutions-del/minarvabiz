/**
 * MIT licensed third-party source (verbatim): Open Mercato contributors.
 * Upstream: https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/shared/src/lib/units/unitCodes.ts
 * The full MIT license and attribution are preserved in THIRD_PARTY_NOTICES.md.
 */
export const REFERENCE_UNIT_CODES = ['kg', 'l', 'm2', 'm3', 'pc'] as const;
export type ReferenceUnitCode = (typeof REFERENCE_UNIT_CODES)[number];

const LEGACY_UNIT_CODE_ALIASES: Record<string, string> = {
  qty: "pc",
};

export function canonicalizeUnitCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const alias = LEGACY_UNIT_CODE_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed.toLowerCase();
}

export function toUnitLookupKey(value: unknown): string | null {
  return canonicalizeUnitCode(value);
}
