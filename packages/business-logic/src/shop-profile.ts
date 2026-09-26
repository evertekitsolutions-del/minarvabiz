/**
 * Shop profile — used on receipts, invoices, and header branding.
 */

import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

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
  gstin: string;
  receiptFooter: string;
  currency: string;
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
