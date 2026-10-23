/**
 * Operator checklist progress is NOT independently verified customer UAT.
 * Existing onboarding IDs are preserved for saved SQLite snapshots.
 */
export type FirstCustomerStepId =
  | "shop" | "products" | "customers" | "customer-balances"
  | "suppliers" | "license" | "backup";

export type FirstCustomerSignals = {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  products: number;
  customers: number;
  suppliers: number;
  licenseStatus: string | null;
  verifiedNativeBackups: number | null;
};

export const firstCustomerRoutes: Record<FirstCustomerStepId, { href: string; title: string; hint: string }> = {
  shop: { href: "/settings", title: "Business profile and invoice details", hint: "Set business name, contact, address and tax/printing settings." },
  products: { href: "/products", title: "Products and opening stock", hint: "Enter stock quantities and sale prices before billing." },
  customers: { href: "/customers", title: "Customers", hint: "Add customers and verify contact details." },
  "customer-balances": { href: "/customers", title: "Opening receivables", hint: "Review each customer's pre-existing outstanding amount, including zero balances." },
  suppliers: { href: "/suppliers", title: "Suppliers and opening payables", hint: "Review supplier balances or confirm there are no opening payables." },
  license: { href: "/license", title: "Commercial license", hint: "Activate and verify the device entitlement; a trial is not a paid license." },
  backup: { href: "/backup", title: "Verified native backup", hint: "Create a local backup and verify its SQLite integrity before going live." },
};

export function firstCustomerEvidence(id: FirstCustomerStepId, signal: FirstCustomerSignals): { observed: boolean; description: string; requiresEvidence: boolean } {
  switch (id) {
    case "shop": {
      const observed = signal.shopName.trim().length > 0 &&
        signal.shopName.trim().toLowerCase() !== "minarva biz" &&
        Boolean(signal.shopPhone.trim() || signal.shopAddress.trim());
      return { observed, description: observed ? "Business details found" : "Replace the default shop details", requiresEvidence: true };
    }
    case "products": return { observed: signal.products > 0, description: signal.products + " products in the catalog", requiresEvidence: true };
    case "customers": return { observed: signal.customers > 0, description: signal.customers + " customer records", requiresEvidence: true };
    case "customer-balances": return { observed: true, description: "Requires manual ledger review", requiresEvidence: false };
    case "suppliers": return { observed: true, description: signal.suppliers > 0 ? signal.suppliers + " suppliers to review" : "Review and confirm none are applicable", requiresEvidence: false };
    case "license": {
      const observed = signal.licenseStatus === "active" || signal.licenseStatus === "grace";
      return { observed, description: observed ? "Commercial entitlement detected" : "Commercial entitlement not verified", requiresEvidence: true };
    }
    case "backup": {
      const observed = signal.verifiedNativeBackups !== null && signal.verifiedNativeBackups > 0;
      return { observed, description: signal.verifiedNativeBackups === null ? "Native backup status unavailable" : observed ? signal.verifiedNativeBackups + " verified local backups" : "No verified native backup found", requiresEvidence: true };
    }
  }
}

export function firstCustomerReviewCounts(
  steps: readonly { id: string; done: boolean }[],
  signals: FirstCustomerSignals,
): { reviewed: number; evidenceSupported: number; total: number } {
  let reviewed = 0;
  let evidenceSupported = 0;
  for (const step of steps) {
    if (!Object.prototype.hasOwnProperty.call(firstCustomerRoutes, step.id)) continue;
    if (step.done) reviewed++;
    const status = firstCustomerEvidence(step.id as FirstCustomerStepId, signals);
    if (step.done && status.observed) evidenceSupported++;
  }
  return { reviewed, evidenceSupported, total: Object.keys(firstCustomerRoutes).length };
}
