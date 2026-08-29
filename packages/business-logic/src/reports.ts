/**
 * Report aggregation — pure helpers over raw metrics.
 */

import { roundMoney } from "@minarvabiz/utils";
import type { SalesReportRow } from "@minarvabiz/types";
import { calculatePeriodSummary } from "./profit";

export interface DayEndInput {
  productSales: number;
  serviceRevenue: number;
  laundryRevenue: number;
  costOfGoods: number;
  orderMaterialCosts: number;
  orderSpecificExpenses: number;
  generalExpenses: number;
  staffIncentives: number;
  cashReceived: number;
  cardPayments: number;
  otherPayments: number;
  outstandingAmount: number;
}

export interface DayEndReport {
  totalSales: number;
  totalExpenses: number;
  costOfGoods: number;
  serviceRevenue: number;
  serviceExpenses: number;
  grossProfit: number;
  netProfit: number;
  cashReceived: number;
  cardPayments: number;
  otherPayments: number;
  outstandingAmount: number;
}

export function buildDayEndReport(input: DayEndInput): DayEndReport {
  const summary = calculatePeriodSummary({
    productSalesRevenue: input.productSales,
    serviceRevenue: input.serviceRevenue + input.laundryRevenue,
    inventoryCostOfGoods: input.costOfGoods,
    orderMaterialCosts: input.orderMaterialCosts,
    orderSpecificExpenses: input.orderSpecificExpenses,
    generalExpenses: input.generalExpenses,
    staffIncentives: input.staffIncentives,
  });

  return {
    totalSales: roundMoney(input.productSales + input.serviceRevenue + input.laundryRevenue),
    totalExpenses: summary.totalOperatingExpenses,
    costOfGoods: summary.totalCostOfGoods,
    serviceRevenue: roundMoney(input.serviceRevenue + input.laundryRevenue),
    serviceExpenses: roundMoney(input.orderSpecificExpenses),
    grossProfit: summary.grossProfit,
    netProfit: summary.netProfit,
    cashReceived: roundMoney(input.cashReceived),
    cardPayments: roundMoney(input.cardPayments),
    otherPayments: roundMoney(input.otherPayments),
    outstandingAmount: roundMoney(input.outstandingAmount),
  };
}

export function sumSalesReportRows(rows: SalesReportRow[]): SalesReportRow {
  return rows.reduce(
    (acc, r) => ({
      label: "Total",
      productSales: roundMoney(acc.productSales + r.productSales),
      serviceRevenue: roundMoney(acc.serviceRevenue + r.serviceRevenue),
      laundryRevenue: roundMoney(acc.laundryRevenue + r.laundryRevenue),
      totalRevenue: roundMoney(acc.totalRevenue + r.totalRevenue),
      expenses: roundMoney(acc.expenses + r.expenses),
      netProfit: roundMoney(acc.netProfit + r.netProfit),
    }),
    {
      label: "Total",
      productSales: 0,
      serviceRevenue: 0,
      laundryRevenue: 0,
      totalRevenue: 0,
      expenses: 0,
      netProfit: 0,
    }
  );
}

export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
