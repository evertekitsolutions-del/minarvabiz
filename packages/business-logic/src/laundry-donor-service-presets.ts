/**
 * MIT adaptation of agrayush13/laundry-lo-src@fd48e8ba2dd29b07f3487013f43fdf92f9e67920
 * ui/src/data/services.ts. Original copyright (c) 2026 Ayush Agrawal.
 * LICENSE: vendor/mit-donors/laundry-lo/LICENSE
 *
 * Donor catalog display defaults, not a substitute for authoritative
 * Supabase tenant/branch/garment rate cards.
 */
import type { LaundryServiceCode } from "./laundry-rate-cards";

export type LaundryDonorServicePreset = {
  id: "wash-fold" | "wash-iron" | "dry-cleaning" | "premium-care";
  name: string;
  shortDescription: string;
  serviceCode: LaundryServiceCode;
  startingPriceINR: number;
  defaultTatHours: number;
};

export const LAUNDRY_DONOR_SERVICE_PRESETS: readonly LaundryDonorServicePreset[] = [
  {
    id: "wash-fold", name: "Wash & Fold",
    shortDescription: "Regular clothes washed, dried and folded",
    serviceCode: "wash", startingPriceINR: 20, defaultTatHours: 48,
  },
  {
    id: "wash-iron", name: "Wash & Iron",
    shortDescription: "Wash followed by professional pressing",
    serviceCode: "steam_iron", startingPriceINR: 30, defaultTatHours: 48,
  },
  {
    id: "dry-cleaning", name: "Dry Cleaning",
    shortDescription: "Fabric-conscious cleaning for delicate garments",
    serviceCode: "dry_clean", startingPriceINR: 199, defaultTatHours: 72,
  },
  {
    id: "premium-care", name: "Premium Care",
    shortDescription: "Suits, sarees, lehengas and luxury garments",
    serviceCode: "special_cleaning", startingPriceINR: 349, defaultTatHours: 96,
  },
] as const;

export function laundryDonorPreset(id: string): LaundryDonorServicePreset | null {
  return LAUNDRY_DONOR_SERVICE_PRESETS.find(preset => preset.id === id) ?? null;
}
