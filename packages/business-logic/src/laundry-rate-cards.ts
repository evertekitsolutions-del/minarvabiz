/** Boutique/laundry local-first rate card. Uses the existing snapshot and permission boundaries. */
import { generateId, nowISO, toMinorUnits } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { activeLaundryBranchId, laundryEffectiveBranchId, laundryRecordInActiveBranch } from "./laundry-branch-scope";

export const LAUNDRY_SERVICES = [
  { code: "wash", label: "Wash" },
  { code: "dry_clean", label: "Dry Clean" },
  { code: "steam_iron", label: "Steam Iron" },
  { code: "iron_fold", label: "Iron + Fold" },
  { code: "starch", label: "Starch" },
  { code: "special_cleaning", label: "Special Cleaning" },
] as const;
export const LAUNDRY_FABRICS = ["regular", "cotton", "silk", "wool", "delicate", "other"] as const;
export type LaundryServiceCode = typeof LAUNDRY_SERVICES[number]["code"];
export type LaundryFabricCode = typeof LAUNDRY_FABRICS[number];
export type LaundryProcessingMode = "outsourced" | "in_house_ironing";

export interface LaundryRateCard {
  id: string;
  mode: LaundryProcessingMode;
  serviceCode: LaundryServiceCode;
  garment: string;
  fabric: LaundryFabricCode;
  /** Supplier-specific garment rate; null is the default for this mode. */
  supplierId?: string | null;
  branchId?: string | null;
  customerRate: number;
  supplierRate: number;
  tatHours: number;
  updatedAt: string;
}

export type LaundryRateInput = Omit<LaundryRateCard, "id" | "updatedAt">;
const cards: LaundryRateCard[] = [];
const serviceCodes = new Set<string>(LAUNDRY_SERVICES.map(s => s.code));
const fabricCodes = new Set<string>(LAUNDRY_FABRICS);
const key = (row: Pick<LaundryRateInput, "mode" | "serviceCode" | "garment" | "fabric" | "supplierId" | "branchId">) =>
  [laundryEffectiveBranchId(row), row.mode, row.mode === "outsourced" ? (row.supplierId || "*") : "in-house", row.serviceCode, row.garment.trim().toLocaleLowerCase("en"), row.fabric].join("|");

export function validateLaundryRateCards(value: unknown): LaundryRateCard[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error("Invalid laundry rate catalog");
  const unique = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid laundry rate entry");
    const row = item as LaundryRateCard;
    if (typeof row.id !== "string" || !row.id || typeof row.updatedAt !== "string"
      || !["outsourced", "in_house_ironing"].includes(row.mode)
      || !serviceCodes.has(row.serviceCode) || !fabricCodes.has(row.fabric)
      || typeof row.garment !== "string" || !row.garment.trim() || row.garment.length > 120
      || (row.supplierId != null && (typeof row.supplierId !== "string" || !row.supplierId.trim() || row.supplierId.length > 120 || row.supplierId.includes("|")))
      || (row.mode === "in_house_ironing" && !!row.supplierId)
      || (row.branchId != null && (typeof row.branchId !== "string" || !row.branchId.trim() || row.branchId.length > 120))
      || !Number.isSafeInteger(row.tatHours) || row.tatHours < 1 || row.tatHours > 24 * 90
      || typeof row.customerRate !== "number" || typeof row.supplierRate !== "number"
      || row.customerRate < 0 || row.supplierRate < 0) throw new Error("Invalid laundry rate fields");
    toMinorUnits(row.customerRate);
    toMinorUnits(row.supplierRate);
    if (row.mode === "in_house_ironing" && row.supplierRate !== 0) throw new Error("In-house laundry cannot have supplier rate");
    const uniqueKey = key(row);
    if (unique.has(uniqueKey)) throw new Error("Duplicate laundry service/garment/fabric rate");
    unique.add(uniqueKey);
    return { ...row, garment: row.garment.trim(), supplierId: row.supplierId || null, branchId: row.branchId || null };
  });
}

export function listLaundryRateCards(): LaundryRateCard[] {
  return cards.filter(laundryRecordInActiveBranch).map(row => ({ ...row })).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode)
    || a.garment.localeCompare(b.garment) || a.fabric.localeCompare(b.fabric));
}

export function findLaundryRateCard(input: Pick<LaundryRateInput, "mode" | "serviceCode" | "garment" | "fabric" | "supplierId">): LaundryRateCard | null {
  const branchId = activeLaundryBranchId();
  if (!branchId) return null;
  const scopedInput = { ...input, branchId };
  const matched = cards.find(item => key(item) === key(scopedInput));
  const generic = input.mode === "outsourced" && input.supplierId
    ? cards.find(item => key(item) === key({ ...scopedInput, supplierId: null }))
    : null;
  const found = matched || generic;
  return found ? { ...found } : null;
}

export function saveLaundryRateCard(input: LaundryRateInput): LaundryRateCard {
  assertPermission("settings.manage");
  const branchId = activeLaundryBranchId();
  if (!branchId) throw new Error("No active branch selected");
  const checked = validateLaundryRateCards([{ ...input, branchId, id: "preflight", updatedAt: nowISO() }])[0];
  const existing = cards.find(item => key(item) === key(checked));
  const next: LaundryRateCard = { ...checked, id: existing?.id || generateId(), updatedAt: nowISO() };
  const before = existing ? { ...existing } : null;
  if (existing) Object.assign(existing, next); else cards.push(next);
  touchPersistence();
  auditAction("laundry.rate_card_save", "laundry_rate_cards", next.id, before, { ...next });
  return { ...next };
}

export function hydrateLaundryRateCards(input: unknown): void {
  const checked = validateLaundryRateCards(input);
  cards.splice(0, cards.length, ...checked);
}

export function exportLaundryRateCards(): LaundryRateCard[] {
  return cards.map(row => ({ ...row }));
}


/** All-or-nothing catalog preflight, preserving existing rate IDs and other branches. */
export function saveLaundryRateCardsBatch(
  inputs: readonly LaundryRateInput[], expectedBranchId: string,
): { created: number; updated: number } {
  assertPermission("settings.manage");
  const branchId = activeLaundryBranchId();
  if (!branchId || !expectedBranchId || branchId !== expectedBranchId) {
    throw new Error("Active branch changed; review and import the rate file again");
  }
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 1000) {
    throw new Error("Import requires 1–1000 laundry rates");
  }
  const timestamp = nowISO();
  const valid = validateLaundryRateCards(inputs.map((row, i) => ({
    ...row, branchId, id: "bulk-preview-" + i, updatedAt: timestamp,
  })));
  const next = cards.map(row => ({ ...row }));
  const audit: Array<{ before: LaundryRateCard | null; after: LaundryRateCard }> = [];
  let created = 0, updated = 0;
  for (const row of valid) {
    const index = next.findIndex(item => key(item) === key(row));
    const before = index < 0 ? null : { ...next[index] };
    const after: LaundryRateCard = {
      ...row, id: before?.id ?? generateId(), updatedAt: timestamp,
    };
    if (index < 0) { next.push(after); created++; }
    else { next[index] = after; updated++; }
    audit.push({ before, after });
  }
  // Validate the merged full snapshot before any state, persistence or audit changes.
  const checked = validateLaundryRateCards(next);
  cards.splice(0, cards.length, ...checked);
  touchPersistence();
  for (const { before, after } of audit) {
    auditAction("laundry.rate_card_save", "laundry_rate_cards", after.id, before, { ...after });
  }
  return { created, updated };
}
