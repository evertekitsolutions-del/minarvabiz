/** Presentation hints only. Server-side tenant authority and licensing remain authoritative. */
export const BUSINESS_GROUPS = ["RETAIL", "EXPIRE_BASED", "SERIALIZED", "DIMENSIONAL", "SERVICE"] as const;
export type BusinessGroup = typeof BUSINESS_GROUPS[number];
export type BusinessCapability = "barcode" | "expiry" | "serial" | "dimension" | "booking";
export type BusinessProfile = Readonly<{ companyId: string; businessGroup: BusinessGroup; businessType: string; capabilities: readonly BusinessCapability[] }>;
const defaults: Record<BusinessGroup, readonly BusinessCapability[]> = {
  RETAIL: ["barcode"], EXPIRE_BASED: ["barcode", "expiry"], SERIALIZED: ["barcode", "serial"],
  DIMENSIONAL: ["barcode", "dimension"], SERVICE: ["booking"],
};
export function resolveBusinessCapabilities(group: BusinessGroup): readonly BusinessCapability[] {
  if (!Object.prototype.hasOwnProperty.call(defaults, group)) throw new Error("Unknown business group");
  return defaults[group];
}
/** Never trust client-provided companyId as authorization. */
export function parseBusinessGroup(value: unknown): BusinessGroup {
  if (typeof value !== "string" || !BUSINESS_GROUPS.some(g => g === value)) throw new Error("Invalid business group");
  return value as BusinessGroup;
}

const KNOWN_CAPABILITIES: readonly BusinessCapability[] = Object.freeze(["barcode", "expiry", "serial", "dimension", "booking"]);

/** Strict parser for admin-verified capability lists; not an authorization token. */
export function parseBusinessCapabilities(value: unknown): readonly BusinessCapability[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length ||
      value.some((v: unknown) => typeof v !== "string" || !KNOWN_CAPABILITIES.includes(v as BusinessCapability))) {
    throw new Error("Invalid business capabilities");
  }
  return Object.freeze([...value] as BusinessCapability[]);
}
