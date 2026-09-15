/**
 * Business-mode templates for tailoring, bridal, uniforms and bulk production.
 * Keeps mode-specific operational defaults deterministic and editable.
 */

export type BusinessMode = "boutique" | "tailoring" | "bridal" | "uniform" | "bulk" | "tshirt" | "laundry";

export interface BusinessModeProfile {
  mode: BusinessMode;
  label: string;
  supportsMeasurements: boolean;
  supportsProduction: boolean;
  supportsMaterialTracking: boolean;
  supportsApprovals: boolean;
  supportsBulkQuantity: boolean;
  defaultStages: string[];
}

const PROFILES: Record<BusinessMode, BusinessModeProfile> = {
  boutique: {
    mode: "boutique", label: "Boutique", supportsMeasurements: true, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: false,
    defaultStages: ["received", "finishing", "qc", "packing", "ready_to_deliver"],
  },
  tailoring: {
    mode: "tailoring", label: "Tailoring", supportsMeasurements: true, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: false,
    defaultStages: ["received", "cutting", "stitching", "finishing", "ironing", "qc", "packing", "ready_to_deliver"],
  },
  bridal: {
    mode: "bridal", label: "Bridal / Wedding", supportsMeasurements: true, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: false,
    defaultStages: ["received", "cutting", "stitching", "embroidery", "finishing", "ironing", "qc", "packing", "ready_to_deliver"],
  },
  uniform: {
    mode: "uniform", label: "Uniform", supportsMeasurements: true, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: true,
    defaultStages: ["received", "cutting", "stitching", "finishing", "qc", "packing", "ready_to_deliver"],
  },
  bulk: {
    mode: "bulk", label: "Bulk / Wholesale", supportsMeasurements: false, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: true,
    defaultStages: ["received", "cutting", "stitching", "finishing", "qc", "packing", "ready_to_deliver"],
  },
  tshirt: {
    mode: "tshirt", label: "T-Shirt Printing", supportsMeasurements: false, supportsProduction: true,
    supportsMaterialTracking: true, supportsApprovals: true, supportsBulkQuantity: true,
    defaultStages: ["received", "printing", "finishing", "qc", "packing", "ready_to_deliver"],
  },
  laundry: {
    mode: "laundry", label: "Laundry / Ironing", supportsMeasurements: false, supportsProduction: false,
    supportsMaterialTracking: false, supportsApprovals: false, supportsBulkQuantity: true,
    defaultStages: ["received", "finishing", "qc", "ready_to_deliver"],
  },
};

export function getBusinessModeProfile(mode: BusinessMode): BusinessModeProfile {
  return { ...PROFILES[mode], defaultStages: [...PROFILES[mode].defaultStages] };
}

export function listBusinessModes(): BusinessModeProfile[] {
  return (Object.keys(PROFILES) as BusinessMode[]).map(getBusinessModeProfile);
}

export function validateModeQuantity(mode: BusinessMode, quantity: number): string[] {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return ["Quantity must be greater than zero"];
  if (!PROFILES[mode].supportsBulkQuantity && q !== 1) return [`${PROFILES[mode].label} mode expects quantity 1 per custom order`];
  return [];
}
