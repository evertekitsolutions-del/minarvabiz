/**
 * Shop profile — used on receipts, invoices, and header branding.
 */

import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";
import { validateWorkspaceDisplayPreferences } from "./workspace-display-preferences";

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

export function updateShopProfile(patch: Partial<ShopProfile>): ShopProfile {
  const next = { ...profile, ...patch };
  const display = validateWorkspaceDisplayPreferences({
    locale: next.locale || "en-IN",
    timeZone: next.timeZone || "Asia/Kolkata",
    currency: next.currency,
  });
  profile = {
    ...next,
    ...display,
    updatedAt: nowISO(),
  };
  touchPersistence();
  return getShopProfile();
}

export function hydrateShopProfile(data: ShopProfile | null | undefined) {
  if (data && data.shopName) {
    // Imported/offline snapshots may contain invalid legacy display settings.
    // Normalize on hydration so subsequent UI formatting cannot crash.
    const restored = { ...defaultProfile, ...data };
    try {
      const display = validateWorkspaceDisplayPreferences({
        locale: restored.locale || defaultProfile.locale!,
        timeZone: restored.timeZone || defaultProfile.timeZone!,
        currency: restored.currency || defaultProfile.currency,
      });
      profile = { ...restored, ...display };
    } catch {
      profile = {
        ...restored,
        locale: defaultProfile.locale,
        timeZone: defaultProfile.timeZone,
        currency: defaultProfile.currency,
      };
    }
  }
}
