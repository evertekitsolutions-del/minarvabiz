/**
 * Shop profile — used on receipts, invoices, and header branding.
 */

import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";
import { validateWorkspaceDisplayPreferences, restoreWorkspaceDisplayPreferences } from "./workspace-display-preferences";

export interface ShopProfile {
  shopName: string;
  legalName: string;
  documentCode: string;
  address: string;
  addressLine2: string;
  district: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  googleReviewUrl?: string;
  gstin: string;
  receiptFooter: string;
  currency: string;
  locale?: string;
  timeZone?: string;
  updatedAt: string;
}

const defaultProfile: ShopProfile = {
  shopName: "Minarva Biz",
  legalName: "",
  documentCode: "",
  address: "",
  addressLine2: "",
  district: "",
  state: "",
  country: "India",
  postalCode: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  receiptFooter: "Thank you for your business!",
  currency: "INR",
  locale: "en-IN",
  timeZone: "Asia/Kolkata",
  updatedAt: nowISO(),
};

let profile: ShopProfile = { ...defaultProfile };

export function getShopProfile(): ShopProfile {
  return { ...profile };
}

export function updateShopProfile(patch: Partial<ShopProfile>, expectedUpdatedAt?: string): ShopProfile {
  // Reject a stale editor instead of overwriting a newer hydrated profile.
  // The caller must reload the latest snapshot and resolve the conflict.
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== profile.updatedAt) {
    throw new Error("Business profile changed since this form was opened. Reload settings before saving.");
  }
  // An explicit blank/null setting is invalid. Only omitted fields may inherit
  // existing values; otherwise a stale client could silently reset the locale.
  for (const field of ["locale", "timeZone", "currency"] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, field) &&
        (typeof patch[field] !== "string" || !patch[field]!.trim())) {
      throw new Error(`Invalid ${field}: enter a non-empty display preference.`);
    }
  }
  const next = { ...profile, ...patch };
  const display = validateWorkspaceDisplayPreferences({
    locale: next.locale || "en-IN",
    timeZone: next.timeZone || "Asia/Kolkata",
    currency: next.currency,
  });
  profile = {
    ...next,
    ...display,
    // Keep the optimistic-concurrency token unique even for two writes in one
    // millisecond or when the device clock moves backwards after hydration.
    updatedAt: (() => {
      const clock = Date.parse(nowISO());
      const previous = Date.parse(profile.updatedAt);
      const next = Math.max(Number.isFinite(clock) ? clock : Date.now(),
        Number.isFinite(previous) ? previous + 1 : 0);
      return new Date(next).toISOString();
    })(),
  };
  touchPersistence();
  return getShopProfile();
}

export function hydrateShopProfile(data: ShopProfile | null | undefined) {
  if (data && data.shopName) {
    // Imported/offline snapshots may contain invalid legacy display settings.
    // Normalize on hydration so subsequent UI formatting cannot crash.
    const restored = { ...defaultProfile, ...data };
    const display = restoreWorkspaceDisplayPreferences(restored, {
      locale: defaultProfile.locale!,
      timeZone: defaultProfile.timeZone!,
      currency: defaultProfile.currency,
    });
    profile = { ...restored, ...display };
  }
}
