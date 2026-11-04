/** Boutique/laundry local-first rate card. Uses the existing snapshot and permission boundaries. */
import { generateId, nowISO, toMinorUnits } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";

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
  customerRate: number;
  supplierRate: number;
  tatHours: number;
  updatedAt: string;
}

export type LaundryRateInput = Omit<LaundryRateCard, "id" | "updatedAt">;
const cards: LaundryRateCard[] = [];
const serviceCodes = new Set<string>(LAUNDRY_SERVICES.map(s => s.code));
const fabricCodes = new Set<string>(LAUNDRY_FABRICS);
const key = (row: Pick<LaundryRateInput, "mode" | "serviceCode" | "garment" | "fabric">) =>
  [row.mode, row.serviceCode, row.garment.trim().toLocaleLowerCase("en"), row.fabric].join("|");

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
      || !Number.isSafeInteger(row.tatHours) || row.tatHours < 1 || row.tatHours > 24 * 90
      || typeof row.customerRate !== "number" || typeof row.supplierRate !== "number"
      || row.customerRate < 0 || row.supplierRate < 0) throw new Error("Invalid laundry rate fields");
    toMinorUnits(row.customerRate);
    toMinorUnits(row.supplierRate);
    if (row.mode === "in_house_ironing" && row.supplierRate !== 0) throw new Error("In-house laundry cannot have supplier rate");
    const uniqueKey = key(row);
    if (unique.has(uniqueKey)) throw new Error("Duplicate laundry service/garment/fabric rate");
    unique.add(uniqueKey);
    return { ...row, garment: row.garment.trim() };
  });
}

export function listLaundryRateCards(): LaundryRateCard[] {
  return cards.map(row => ({ ...row })).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode)
    || a.garment.localeCompare(b.garment) || a.fabric.localeCompare(b.fabric));
}

export function findLaundryRateCard(input: Pick<LaundryRateInput, "mode" | "serviceCode" | "garment" | "fabric">): LaundryRateCard | null {
  const found = cards.find(item => key(item) === key(input));
  return found ? { ...found } : null;
}

export function saveLaundryRateCard(input: LaundryRateInput): LaundryRateCard {
  assertPermission("settings.manage");
  const checked = validateLaundryRateCards([{ ...input, id: "preflight", updatedAt: nowISO() }])[0];
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
  return listLaundryRateCards();
}
