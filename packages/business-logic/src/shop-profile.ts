/**
 * Shop profile — used on receipts, invoices, and header branding.
 */

import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export interface ShopProfile {
  shopName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  receiptFooter: string;
  currency: string;
  updatedAt: string;
}

const defaultProfile: ShopProfile = {
  shopName: "Minarva Biz",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  receiptFooter: "Thank you for your business!",
  currency: "INR",
  updatedAt: nowISO(),
};

let profile: ShopProfile = { ...defaultProfile };

export function getShopProfile(): ShopProfile {
  return { ...profile };
}

export function updateShopProfile(patch: Partial<ShopProfile>): ShopProfile {
  profile = {
    ...profile,
    ...patch,
    updatedAt: nowISO(),
  };
  touchPersistence();
  return getShopProfile();
}

export function hydrateShopProfile(data: ShopProfile | null | undefined) {
  if (data && data.shopName) {
    profile = { ...defaultProfile, ...data };
  }
}
