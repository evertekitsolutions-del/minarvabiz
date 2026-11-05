/**
 * Optional workspace industry profile. No industry is enabled by default.
 * Browser-local operator preference only: not an entitlement, security gate,
 * shared company configuration or authoritative cloud/SQLite record.
 */
export const INDUSTRY_PACKS = {
  retail: { label: "Retail / Supermarket", modules: ["pos", "stock", "reorder"] },
  wholesale: { label: "Wholesale / Distribution", modules: ["bulk-orders", "stock", "vendor-terms"] },
  restaurant: { label: "Restaurant / Food Service", modules: ["tables", "kitchen-tickets", "menu"] },
  pharmacy: { label: "Pharmacy", modules: ["batch-expiry", "stock", "purchase"] },
  garments: { label: "Garments / Footwear", modules: ["variants", "stock", "pos"] },
  salon: { label: "Salon / Wellness", modules: ["appointments", "service-packages"] },
  professional: { label: "Professional Services", modules: ["projects", "appointments"] },
  repair: { label: "Repair / Service Center", modules: ["job-cards", "warranty", "amc"] },
  manufacturing: { label: "Manufacturing", modules: ["production", "materials", "quality"] },
  tailoring: { label: "Boutique / Tailoring", modules: ["measurements", "production", "variants"] },
  laundry: { label: "Laundry / Ironing", modules: ["garment-tickets", "service-rates", "handover"] },
} as const;

export type IndustryPackId = keyof typeof INDUSTRY_PACKS;
export type IndustryWorkspaceProfile = {
  version: 1;
  primary: IndustryPackId | null;
  enabled: IndustryPackId[];
};

const ids = Object.keys(INDUSTRY_PACKS) as IndustryPackId[];
const validIds = new Set<string>(ids);
export const EMPTY_INDUSTRY_PROFILE: IndustryWorkspaceProfile = {
  version: 1, primary: null, enabled: [],
};

export function listIndustryPacks() {
  return ids.map(id => ({ id, label: INDUSTRY_PACKS[id].label, modules: [...INDUSTRY_PACKS[id].modules] }));
}

/** Reject tampered or incompatible snapshots rather than silently enabling packs. */
export function validateIndustryProfile(input: unknown): IndustryWorkspaceProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid industry profile");
  const data = input as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.enabled) || data.enabled.length > ids.length) {
    throw new Error("Unsupported industry profile");
  }
  const enabled = data.enabled;
  if (enabled.some(id => typeof id !== "string" || !validIds.has(id)) || new Set(enabled).size !== enabled.length) {
    throw new Error("Unknown or duplicate industry pack");
  }
  if (data.primary !== null && (typeof data.primary !== "string" || !enabled.includes(data.primary))) {
    throw new Error("Primary industry must be enabled");
  }
  return { version: 1, primary: data.primary as IndustryPackId | null, enabled: ids.filter(id => enabled.includes(id)) };
}

export function buildIndustryProfile(primary: IndustryPackId | null, enabled: readonly IndustryPackId[]): IndustryWorkspaceProfile {
  return validateIndustryProfile({ version: 1, primary, enabled: [...enabled] });
}

/** No PII; a missing identity or branch is never mapped to a shared default. */
export function industryPreferenceKey(userId: string | null, branchId: string | null, demo: boolean): string | null {
  if (!userId?.trim() || !branchId?.trim()) return null;
  return `minarva:industry-profile:v1:${demo ? "demo" : "live"}:${encodeURIComponent(userId)}:${encodeURIComponent(branchId)}`;
}

export function readIndustryProfile(storage: Pick<Storage, "getItem">, key: string): IndustryWorkspaceProfile {
  if (!key.startsWith("minarva:industry-profile:v1:")) throw new Error("Invalid industry preference scope");
  const raw = storage.getItem(key);
  return raw === null ? { ...EMPTY_INDUSTRY_PROFILE, enabled: [] } : validateIndustryProfile(JSON.parse(raw));
}

export function writeIndustryProfile(storage: Pick<Storage, "setItem">, key: string, profile: IndustryWorkspaceProfile): void {
  if (!key.startsWith("minarva:industry-profile:v1:")) throw new Error("Invalid industry preference scope");
  storage.setItem(key, JSON.stringify(validateIndustryProfile(profile)));
}
