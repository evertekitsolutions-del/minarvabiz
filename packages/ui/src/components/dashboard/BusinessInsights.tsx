"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import type { DashboardData } from "./Dashboard";

export interface BusinessInsight {
  title: string;
  detail: string;
  action?: string;
  tone: "positive" | "warning" | "critical" | "info";
}

function buildInsights(data: DashboardData): BusinessInsight[] {
  const { stats } = data;
  const insights: BusinessInsight[] = [];
  const toNumber = (value?: string) => Number((value ?? "").replace(/[^0-9.-]/g, "")) || 0;

  if (stats.lowStockCount && toNumber(stats.lowStockCount.value) > 0) {
    const count = toNumber(stats.lowStockCount.value);
    insights.push({
      title: "Inventory needs attention",
      detail: `${count} item${count === 1 ? "" : "s"} are at or below the minimum stock level.`,
      action: "Review low stock",
      tone: count >= 5 ? "critical" : "warning",
    });
  }

  if (stats.outstandingPayments && toNumber(stats.outstandingPayments.value) > 0) {
    insights.push({
      title: "Collections opportunity",
      detail: `${stats.outstandingPayments.value} is currently outstanding from customers.`,
      action: "Open outstanding payments",
      tone: "warning",
    });
  }

  if (stats.pendingOrders && toNumber(stats.pendingOrders.value) > 0) {
    const pending = toNumber(stats.pendingOrders.value);
    insights.push({
      title: "Order workload",
      detail: `${pending} order${pending === 1 ? "" : "s"} still need attention before delivery.`,
      action: "Review pending orders",
      tone: pending >= 10 ? "critical" : "info",
    });
  }

  if (stats.readyOrders && toNumber(stats.readyOrders.value) > 0) {
    const ready = toNumber(stats.readyOrders.value);
    insights.push({
      title: "Ready-to-deliver revenue",
      detail: `${ready} completed order${ready === 1 ? "" : "s"} can be moved to delivery/collection.`,
      action: "Open ready orders",
      tone: "positive",
    });
  }

  if (stats.totalProfit.positive) {
    insights.push({
      title: "Profit trend is healthy",
      detail: `Total profit is showing ${stats.totalProfit.change} versus the comparison period.`,
      tone: "positive",
    });
  } else {
    insights.push({
      title: "Profit trend needs review",
      detail: `Total profit is showing ${stats.totalProfit.change} versus the comparison period.`,
      action: "Open reports",
      tone: "warning",
    });
  }

  if (stats.todayExpenses && stats.todayExpenses.positive === false) {
    insights.push({
      title: "Expense pressure",
      detail: `Today's expense movement is unfavorable: ${stats.todayExpenses.change ?? "review today's spend"}.`,
      action: "Review expenses",
      tone: "warning",
    });
  }

  return insights.slice(0, 5);
}

const toneClass: Record<BusinessInsight["tone"], string> = {
  positive: "border-emerald-100 bg-emerald-50/60",
  warning: "border-amber-100 bg-amber-50/60",
  critical: "border-rose-100 bg-rose-50/60",
  info: "border-blue-100 bg-blue-50/60",
};

const dotClass: Record<BusinessInsight["tone"], string> = {
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  info: "bg-blue-500",
};

export function BusinessInsights({ data }: { data: DashboardData }) {
  const insights = React.useMemo(() => buildInsights(data), [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">✦</span>
          Minarva Business Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {insights.map((item) => (
          <div key={`${item.title}-${item.detail}`} className={`rounded-xl border p-3 ${toneClass[item.tone]}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[item.tone]}`} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                {item.action && <div className="mt-2 text-xs font-semibold text-slate-700">{item.action} →</div>}
              </div>
            </div>
          </div>
        ))}
        {insights.length === 0 && (
          <div className="lg:col-span-2 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
            No urgent business signals right now. Keep operating normally and Minarva will surface exceptions as they appear.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
