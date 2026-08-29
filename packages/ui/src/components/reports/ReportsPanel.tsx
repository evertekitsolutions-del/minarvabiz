"use client";

import * as React from "react";
import type { SalesReportRow } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

export interface DayEndView {
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

export interface StockRow {
  id: string;
  name: string;
  sku?: string | null;
  stock: number;
  min: number;
  value: number;
  low: boolean;
}

export function ReportsPanel({
  salesRows,
  dayEnd,
  stock,
  outstanding,
  onExportCsv,
  onRefresh,
}: {
  salesRows: SalesReportRow[];
  dayEnd: DayEndView;
  stock: StockRow[];
  outstanding: Array<{ id: string; name: string; phone?: string | null; outstanding: number }>;
  onExportCsv?: (kind: string) => void;
  onRefresh?: () => void;
}) {
  const [tab, setTab] = React.useState<"sales" | "dayend" | "stock" | "outstanding">("sales");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reports & Analytics</h2>
          <p className="text-sm text-slate-500">Business intelligence</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRefresh}>Refresh</Button>
          <Button variant="outline" onClick={() => onExportCsv?.(tab)}>Export CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["sales", "dayend", "stock", "outstanding"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>
            {t === "dayend" ? "Day-end" : t === "outstanding" ? "Outstanding" : t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "sales" && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Sales summary</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-400">
                  <th className="pb-2">Period</th>
                  <th className="pb-2">Products</th>
                  <th className="pb-2">Services</th>
                  <th className="pb-2">Laundry</th>
                  <th className="pb-2">Revenue</th>
                  <th className="pb-2">Expenses</th>
                  <th className="pb-2">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map((r) => (
                  <tr key={r.label} className="border-b border-slate-50">
                    <td className="py-2 font-medium">{r.label}</td>
                    <td className="py-2">{formatMoney(r.productSales)}</td>
                    <td className="py-2">{formatMoney(r.serviceRevenue)}</td>
                    <td className="py-2">{formatMoney(r.laundryRevenue)}</td>
                    <td className="py-2 font-medium">{formatMoney(r.totalRevenue)}</td>
                    <td className="py-2">{formatMoney(r.expenses)}</td>
                    <td className={`py-2 font-semibold ${r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {formatMoney(r.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "dayend" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["Total sales", dayEnd.totalSales],
            ["Service revenue", dayEnd.serviceRevenue],
            ["Cost of goods", dayEnd.costOfGoods],
            ["Gross profit", dayEnd.grossProfit],
            ["Total expenses", dayEnd.totalExpenses],
            ["Net profit", dayEnd.netProfit],
            ["Cash received", dayEnd.cashReceived],
            ["Card / UPI", dayEnd.cardPayments],
            ["Other payments", dayEnd.otherPayments],
            ["Outstanding", dayEnd.outstandingAmount],
          ].map(([label, val]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-bold text-slate-900">{formatMoney(val as number)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "stock" && (
        <Card>
          <CardContent className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-400">
                  <th className="pb-2">Product</th>
                  <th className="pb-2">SKU</th>
                  <th className="pb-2">Stock</th>
                  <th className="pb-2">Min</th>
                  <th className="pb-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-slate-500">{r.sku || "—"}</td>
                    <td className={`py-2 ${r.low ? "font-semibold text-rose-600" : ""}`}>{r.stock}</td>
                    <td className="py-2">{r.min}</td>
                    <td className="py-2">{formatMoney(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "outstanding" && (
        <Card>
          <CardContent className="space-y-2 p-4">
            {outstanding.length === 0 && <p className="text-sm text-slate-400">No outstanding balances</p>}
            {outstanding.map((c) => (
              <div key={c.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.phone || ""}</div>
                </div>
                <span className="font-semibold text-rose-600">{formatMoney(c.outstanding)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
