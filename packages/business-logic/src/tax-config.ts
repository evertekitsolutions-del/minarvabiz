/** GST / tax configuration for invoices */
import { nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export interface TaxRate {
  id: string;
  name: string;
  ratePercent: number;
  isDefault: boolean;
}

export interface TaxConfig {
  enableGst: boolean;
  gstin: string;
  defaultRatePercent: number;
  rates: TaxRate[];
  updatedAt: string;
}

let config: TaxConfig = {
  enableGst: true,
  gstin: "",
  defaultRatePercent: 5,
  rates: [
    { id: "tax-0", name: "Exempt", ratePercent: 0, isDefault: false },
    { id: "tax-5", name: "GST 5%", ratePercent: 5, isDefault: true },
    { id: "tax-12", name: "GST 12%", ratePercent: 12, isDefault: false },
    { id: "tax-18", name: "GST 18%", ratePercent: 18, isDefault: false },
  ],
  updatedAt: nowISO(),
};

export function getTaxConfig(): TaxConfig {
  return JSON.parse(JSON.stringify(config));
}

export function updateTaxConfig(patch: Partial<TaxConfig>): TaxConfig {
  config = { ...config, ...patch, updatedAt: nowISO() };
  if (patch.gstin !== undefined) {
    void import("./shop-profile").then((m) => {
      m.updateShopProfile({ gstin: patch.gstin! });
    });
  }
  touchPersistence();
  return getTaxConfig();
}

export function hydrateTaxConfig(data: TaxConfig | null | undefined) {
  if (data) config = { ...config, ...data };
}

export function calcTaxAmount(taxable: number, ratePercent: number): number {
  return Math.round((taxable * ratePercent) / 100 * 100) / 100;
}
