/**
 * Shop profile — used on receipts, invoices, and header branding.
 */

import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export interface ShopProfile {
  shopName: string;
  legalName: string;
  documentCode: string;
  financialYearStartMonth: number;
  address: string;
  addressLine2: string;
  district: string;
  state: string;
  stateCode: string;
  country: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  authorizedSignatory: string;
  termsAndConditions: string;
  receiptFooter: string;
  currency: string;
  updatedAt: string;
}

const defaultProfile: ShopProfile = {
  shopName: "Minarva Biz",
  legalName: "",
  documentCode: "MB",
  financialYearStartMonth: 4,
  address: "",
  addressLine2: "",
  district: "",
  state: "",
  stateCode: "",
  country: "India",
  pincode: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  pan: "",
  authorizedSignatory: "",
  termsAndConditions: "Goods once sold are subject to the shop's return policy. Please retain this invoice for future reference.",
  receiptFooter: "Thank you for your business!",
  currency: "INR",
  updatedAt: nowISO(),
};

let profile: ShopProfile = { ...defaultProfile };

export function getShopProfile(): ShopProfile {
  return { ...profile };
}

export function updateShopProfile(patch: Partial<ShopProfile>): ShopProfile {
  const documentCode = patch.documentCode == null
    ? profile.documentCode
    : String(patch.documentCode).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
  const financialYearStartMonth = patch.financialYearStartMonth == null
    ? profile.financialYearStartMonth
    : Math.max(1, Math.min(12, Math.trunc(Number(patch.financialYearStartMonth) || 4)));
  profile = {
    ...profile,
    ...patch,
    documentCode: documentCode || profile.documentCode || "MB",
    financialYearStartMonth,
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
