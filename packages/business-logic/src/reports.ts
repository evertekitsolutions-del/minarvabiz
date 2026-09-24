/**
 * Report aggregation — pure helpers over raw metrics.
 */

import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";
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
  const serviceRevenueMinor = addMinorUnits(
    toMinorUnits(input.serviceRevenue),
    toMinorUnits(input.laundryRevenue),
  );
  const summary = calculatePeriodSummary({
    productSalesRevenue: input.productSales,
    serviceRevenue: fromMinorUnits(serviceRevenueMinor),
    inventoryCostOfGoods: input.costOfGoods,
    orderMaterialCosts: input.orderMaterialCosts,
    orderSpecificExpenses: input.orderSpecificExpenses,
    generalExpenses: input.generalExpenses,
    staffIncentives: input.staffIncentives,
  });

  return {
    totalSales: fromMinorUnits(addMinorUnits(toMinorUnits(input.productSales), serviceRevenueMinor)),
    totalExpenses: summary.totalOperatingExpenses,
    costOfGoods: summary.totalCostOfGoods,
    serviceRevenue: fromMinorUnits(serviceRevenueMinor),
    serviceExpenses: fromMinorUnits(toMinorUnits(input.orderSpecificExpenses)),
    grossProfit: summary.grossProfit,
    netProfit: summary.netProfit,
    cashReceived: fromMinorUnits(toMinorUnits(input.cashReceived)),
    cardPayments: fromMinorUnits(toMinorUnits(input.cardPayments)),
    otherPayments: fromMinorUnits(toMinorUnits(input.otherPayments)),
    outstandingAmount: fromMinorUnits(toMinorUnits(input.outstandingAmount)),
  };
}

export function sumSalesReportRows(rows: SalesReportRow[]): SalesReportRow {
  const totals = rows.reduce(
    (acc, row) => ({
      productSales: addMinorUnits(acc.productSales, toMinorUnits(row.productSales)),
      serviceRevenue: addMinorUnits(acc.serviceRevenue, toMinorUnits(row.serviceRevenue)),
      laundryRevenue: addMinorUnits(acc.laundryRevenue, toMinorUnits(row.laundryRevenue)),
      totalRevenue: addMinorUnits(acc.totalRevenue, toMinorUnits(row.totalRevenue)),
      expenses: addMinorUnits(acc.expenses, toMinorUnits(row.expenses)),
      netProfit: addMinorUnits(acc.netProfit, toMinorUnits(row.netProfit)),
    }),
    {
      productSales: 0,
      serviceRevenue: 0,
      laundryRevenue: 0,
      totalRevenue: 0,
      expenses: 0,
      netProfit: 0,
    },
  );
  return {
    label: "Total",
    productSales: fromMinorUnits(totals.productSales),
    serviceRevenue: fromMinorUnits(totals.serviceRevenue),
    laundryRevenue: fromMinorUnits(totals.laundryRevenue),
    totalRevenue: fromMinorUnits(totals.totalRevenue),
    expenses: fromMinorUnits(totals.expenses),
    netProfit: fromMinorUnits(totals.netProfit),
  };
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
