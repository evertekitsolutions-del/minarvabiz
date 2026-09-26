import type { TrialBalanceRow } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, subtractMinorUnits, toMinorUnits } from "@minarvabiz/utils";
import * as accountingStore from "./accounting-store";
import * as mainStore from "./store";
import * as phase5Store from "./phase5-store";
import * as procurementStore from "./procurement-store";
import { assertPermission } from "./permissions";

export interface ReceivableReportRow {
  customerId: string;
  customerName: string;
  phone?: string | null;
  outstanding: number;
}

export interface PayableReportRow {
  supplierId: string;
  supplierName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  invoiceOutstanding: number;
  otherOutstanding: number;
  totalOutstanding: number;
}

export interface TaxLedgerAccountSummary {
  accountId: string | null;
  accountName: string;
  debit: number;
  credit: number;
  movement: number;
  closingBalance: number;
}

export interface TaxLedgerReconciliation {
  outputTax: TaxLedgerAccountSummary;
  inputTax: TaxLedgerAccountSummary;
  purchaseTaxPending: TaxLedgerAccountSummary;
  netTaxPayableMovement: number;
}

export interface FinancialReportingSnapshot {
  from?: string;
  to?: string;
  asOf: string;
  profitAndLoss: ReturnType<typeof accountingStore.buildProfitAndLoss>;
  trialBalance: TrialBalanceRow[];
  receivables: ReceivableReportRow[];
  payables: PayableReportRow[];
  totalReceivables: number;
  totalPayables: number;
  tax: TaxLedgerReconciliation;
}

function sumMoney(values: number[]): number {
  return fromMinorUnits(values.reduce((total, value) => addMinorUnits(total, toMinorUnits(value)), 0));
}

function closingFor(row: TrialBalanceRow | undefined, normal: "debit" | "credit"): number {
  if (!row) return 0;
  return normal === "debit"
    ? fromMinorUnits(subtractMinorUnits(toMinorUnits(row.debit), toMinorUnits(row.credit)))
    : fromMinorUnits(subtractMinorUnits(toMinorUnits(row.credit), toMinorUnits(row.debit)));
}

function taxAccountSummary(
  systemKey: "tax_payable" | "input_tax" | "purchase_tax_pending",
  from: string | undefined,
  to: string | undefined,
  trial: TrialBalanceRow[],
): TaxLedgerAccountSummary {
  const account = accountingStore.getSystemAccount(systemKey);
  if (!account) {
    return { accountId: null, accountName: systemKey, debit: 0, credit: 0, movement: 0, closingBalance: 0 };
  }
  const ledger = accountingStore.buildGeneralLedger(account.id, from, to);
  const debit = sumMoney(ledger.map((row) => row.debit));
  const credit = sumMoney(ledger.map((row) => row.credit));
  const movement = account.normalBalance === "debit"
    ? fromMinorUnits(subtractMinorUnits(toMinorUnits(debit), toMinorUnits(credit)))
    : fromMinorUnits(subtractMinorUnits(toMinorUnits(credit), toMinorUnits(debit)));
  return {
    accountId: account.id,
    accountName: account.name,
    debit,
    credit,
    movement,
    closingBalance: closingFor(trial.find((row) => row.accountId === account.id), account.normalBalance),
  };
}

export function buildFinancialReportingSnapshot(from?: string, to?: string): FinancialReportingSnapshot {
  assertPermission("reports.view");
  assertPermission("accounting.view");
  const asOf = to || new Date().toISOString().slice(0, 10);
  const profitAndLoss = accountingStore.buildProfitAndLoss(from, to);
  const trialBalance = accountingStore.buildTrialBalance(to);

  const receivables = mainStore.listCustomers()
    .filter((customer) => Number.isFinite(customer.outstandingBalance) && customer.outstandingBalance > 0.005)
    .map((customer) => ({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      outstanding: customer.outstandingBalance,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);

  const agingBySupplier = new Map(
    procurementStore.buildSupplierPayableAging(asOf).map((row) => [row.supplierId, row]),
  );
  const payables = phase5Store.listSuppliers()
    .filter((supplier) => Number.isFinite(supplier.outstandingBalance) && supplier.outstandingBalance > 0.005)
    .map((supplier) => {
      const aging = agingBySupplier.get(supplier.id);
      const invoiceOutstanding = aging?.totalOutstanding ?? 0;
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        current: aging?.current ?? 0,
        days1to30: aging?.days1to30 ?? 0,
        days31to60: aging?.days31to60 ?? 0,
        days61to90: aging?.days61to90 ?? 0,
        days90plus: aging?.days90plus ?? 0,
        invoiceOutstanding,
        otherOutstanding: fromMinorUnits(subtractMinorUnits(toMinorUnits(supplier.outstandingBalance), toMinorUnits(invoiceOutstanding))),
        totalOutstanding: supplier.outstandingBalance,
      };
    })
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const outputTax = taxAccountSummary("tax_payable", from, to, trialBalance);
  const inputTax = taxAccountSummary("input_tax", from, to, trialBalance);
  const purchaseTaxPending = taxAccountSummary("purchase_tax_pending", from, to, trialBalance);
  const netTaxPayableMovement = fromMinorUnits(
    subtractMinorUnits(toMinorUnits(outputTax.movement), toMinorUnits(inputTax.movement)),
  );

  return {
    from,
    to,
    asOf,
    profitAndLoss,
    trialBalance,
    receivables,
    payables,
    totalReceivables: sumMoney(receivables.map((row) => row.outstanding)),
    totalPayables: sumMoney(payables.map((row) => row.totalOutstanding)),
    tax: { outputTax, inputTax, purchaseTaxPending, netTaxPayableMovement },
  };
}
