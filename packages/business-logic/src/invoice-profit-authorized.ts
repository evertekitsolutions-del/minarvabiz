/**
 * Restricted SAL-026 original-invoice profit lookup.
 *
 * Historical costs are sensitive financial data. The permission gate is in
 * domain logic, not only a hidden UI button. Never attach these numbers to
 * invoice print templates, exported customer CSVs, or public APIs.
 */
import { assertPermission } from "./permissions";
import { getSale } from "./store";
import { getActiveBranch } from "./phase9-store";
import { calculateOriginalInvoiceGrossProfit, type InvoiceGrossProfit } from "./invoice-gross-profit";

export function readAuthorizedInvoiceGrossProfit(saleId: string): InvoiceGrossProfit {
  assertPermission("accounting.view");
  if (typeof saleId !== "string" || !saleId || saleId.length > 128) {
    throw new Error("Valid invoice identity is required");
  }
  const sale = getSale(saleId);
  if (!sale) throw new Error("Posted invoice not found");
  const activeBranch = getActiveBranch();
  // A user cannot inspect an invoice from another branch by knowing its ID.
  // Legacy unscoped invoice records remain available under existing local role.
  if (sale.branchId && (!activeBranch || sale.branchId !== activeBranch.id)) {
    throw new Error("Invoice profit cannot be read outside the active branch");
  }
  return calculateOriginalInvoiceGrossProfit(sale);
}
