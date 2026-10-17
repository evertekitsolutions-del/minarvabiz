import { getBusinessPresetByCode } from "#business-presets";
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

/**
 * A validated UI hint, NOT a license, role or tenant authorization token.
 * Upstream code must establish verifiedOrgId with a trusted session/device authority.
 */
export type BusinessUIProfile =
  | Readonly<{ mode: "legacy"; orgId: string; businessGroup: null; enabledCapabilities: readonly [] }>
  | Readonly<{ mode: "configured"; orgId: string; businessGroup: BusinessGroup;
    presetCode: string; enabledCapabilities: readonly BusinessCapability[] }>;

export interface VerifiedPresentationContext {
  readonly verifiedOrgId: string;
  readonly orgRecord: unknown;
  readonly allowedByLicense: readonly BusinessCapability[];
  readonly allowedByRole: readonly BusinessCapability[];
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function resolveBusinessUIProfile(context: VerifiedPresentationContext): BusinessUIProfile {
  if (!context || typeof context.verifiedOrgId !== "string" ||
      !context.verifiedOrgId.trim() || !plainRecord(context.orgRecord) ||
      context.orgRecord.id !== context.verifiedOrgId) {
    throw new Error("Untrusted business profile scope");
  }

  const license = new Set(parseBusinessCapabilities(context.allowedByLicense));
  const role = new Set(parseBusinessCapabilities(context.allowedByRole));
  const record = context.orgRecord;
  const hasGroup = Object.hasOwn(record, "business_group");
  const hasPreset = Object.hasOwn(record, "business_type_code");
  if (!hasGroup && !hasPreset) {
    return Object.freeze({ mode: "legacy" as const, orgId: context.verifiedOrgId,
      businessGroup: null, enabledCapabilities: Object.freeze([]) as readonly [] });
  }

  try {
    if (!hasGroup || !hasPreset || typeof record.business_type_code !== "string") {
      throw new Error("Missing group or preset");
    }
    const businessGroup = parseBusinessGroup(record.business_group);
    const preset = getBusinessPresetByCode(record.business_type_code);
    if (!preset || preset.businessGroup !== businessGroup) {
      throw new Error("Group and preset mismatch");
    }

    const config = Object.hasOwn(record, "feature_config") ? record.feature_config : {};
    if (!plainRecord(config) || Object.keys(config).some(key => key !== "additionalCapabilities")) {
      throw new Error("Invalid configuration object");
    }
    const extras = Object.hasOwn(config, "additionalCapabilities")
      ? parseBusinessCapabilities(config.additionalCapabilities)
      : [];
    const requested = new Set<BusinessCapability>([
      ...resolveBusinessCapabilities(businessGroup), ...preset.defaultAddons, ...extras,
    ]);
    const enabledCapabilities = Object.freeze(KNOWN_CAPABILITIES.filter(capability =>
      requested.has(capability) && license.has(capability) && role.has(capability),
    ));
    return Object.freeze({
      mode: "configured" as const,
      orgId: context.verifiedOrgId,
      businessGroup,
      presetCode: preset.code,
      enabledCapabilities,
    });
  } catch {
    throw new Error("Invalid business profile");
  }
}
