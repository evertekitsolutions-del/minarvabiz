import { accountingStore, procurementStore } from "@minarvabiz/business-logic";

type ProfessionalReportData = {
  payables: ReturnType<typeof procurementStore.buildSupplierPayableAging>;
  financial?: {
    trialBalance: ReturnType<typeof accountingStore.buildTrialBalance>;
    profit: ReturnType<typeof accountingStore.buildProfitAndLoss>;
    balance: ReturnType<typeof accountingStore.buildBalanceSheet>;
  };
  taxReport?: ReturnType<typeof accountingStore.buildTaxReconciliation>;
  error: string | null;
};

export function buildProfessionalReportData(from?: string, to?: string): ProfessionalReportData {
  const payables = procurementStore.buildSupplierPayableAging(to);
  if (from && to && from > to) {
    return { payables, financial: undefined, taxReport: undefined, error: "Report start date must be on or before end date" };
  }
  try {
    return {
      payables,
      financial: {
        trialBalance: accountingStore.buildTrialBalance(to),
        profit: accountingStore.buildProfitAndLoss(from, to),
        balance: accountingStore.buildBalanceSheet(to),
      },
      taxReport: accountingStore.buildTaxReconciliation(from, to),
      error: null,
    };
  } catch (error) {
    return {
      payables,
      financial: undefined,
      taxReport: undefined,
      error: error instanceof Error ? error.message : "Unable to build financial reports",
    };
  }
}
