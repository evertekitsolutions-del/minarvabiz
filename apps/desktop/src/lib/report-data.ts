import { accountingStore, procurementStore } from "@minarvabiz/business-logic";

export function buildProfessionalReportData(from?: string, to?: string) {
  return {
    payables: procurementStore.buildSupplierPayableAging(to),
    financial: {
      trialBalance: accountingStore.buildTrialBalance(to),
      profit: accountingStore.buildProfitAndLoss(from, to),
      balance: accountingStore.buildBalanceSheet(to),
    },
    taxReport: accountingStore.buildTaxReconciliation(from, to),
  };
}
