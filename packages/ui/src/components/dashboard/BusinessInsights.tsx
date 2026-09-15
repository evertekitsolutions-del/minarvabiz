"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import type { DashboardData } from "./Dashboard";
import { generateNextBestActions } from "@minarvabiz/business-logic";

export interface BusinessInsight {
  title: string;
  detail: string;
  action?: string;
  tone: "positive" | "warning" | "critical" | "info";
}

function buildInsights(data: DashboardData): BusinessInsight[] {
  const { stats, productionControl, customerIntelligence, inventoryIntelligence, staffProductivity } = data;
  const insights: BusinessInsight[] = [];
  const toNumber = (value?: string) => Number((value ?? "").replace(/[^0-9.-]/g, "")) || 0;

  const nextBestActions = generateNextBestActions({
    overdueOrders: productionControl?.overdue,
    unassignedOrders: productionControl?.unassigned,
    dueTodayOrders: productionControl?.dueToday,
    outOfStockProducts: inventoryIntelligence?.outOfStockProducts,
    reorderProducts: inventoryIntelligence?.reorderProducts,
    deadStockProducts: inventoryIntelligence?.deadStockProducts,
    highRiskCustomers: customerIntelligence?.highRiskCount,
    followUpCustomers: customerIntelligence?.followUpCount,
    outstandingAmount: toNumber(stats.outstandingPayments?.value),
    overdueAssignments: productionControl?.staffLoad.reduce((sum, staff) => sum + staff.overdueAssignments, 0),
    overloadedStaff: staffProductivity?.overloadedStaff,
  });

  const toneForPriority = (priority: string): BusinessInsight["tone"] => {
    if (priority === "urgent") return "critical";
    if (priority === "high") return "warning";
    return "info";
  };

  for (const action of nextBestActions.slice(0, 4)) {
    insights.push({
      title: action.title,
      detail: action.reason,
      action: action.title,
      tone: toneForPriority(action.priority),
    });
  }

  if (stats.lowStockCount && toNumber(stats.lowStockCount.value) > 0 && !inventoryIntelligence) {
    const count = toNumber(stats.lowStockCount.value);
    insights.push({
      title: "Inventory needs attention",
      detail: `${count} item${count === 1 ? "" : "s"} are at or below the minimum stock level.`,
      action: "Review low stock",
      tone: count >= 5 ? "critical" : "warning",
    });
  }

  if (stats.outstandingPayments && toNumber(stats.outstandingPayments.value) > 0 && !nextBestActions.some((item) => item.kind === "payments")) {
    insights.push({
      title: "Collections opportunity",
      detail: `${stats.outstandingPayments.value} is currently outstanding from customers.`,
      action: "Open outstanding payments",
      tone: "warning",
    });
  }

  if (stats.pendingOrders && toNumber(stats.pendingOrders.value) > 0 && !productionControl) {
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

  const unique = new Map<string, BusinessInsight>();
  for (const insight of insights) unique.set(`${insight.title}-${insight.detail}`, insight);
  return [...unique.values()].slice(0, 5);
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

export function BusinessInsights({
  data,
  onAction,
}: {
  data: DashboardData;
  onAction?: (action: string) => void;
}) {
  const insights = React.useMemo(() => buildInsights(data), [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">✦</span>
          Minarva Business Intelligence
        </CardTitle>
        <p className="text-xs text-slate-500">Explainable priorities generated from recorded business data. Financial arithmetic remains deterministic.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {insights.map((item) => (
          <div key={`${item.title}-${item.detail}`} className={`rounded-xl border p-3 ${toneClass[item.tone]}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[item.tone]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                {item.action && onAction && (
                  <button
                    type="button"
                    onClick={() => onAction(item.action!)}
                    className="mt-2 inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white/70 hover:text-slate-950"
                  >
                    {item.action} →
                  </button>
                )}
                {item.action && !onAction && <div className="mt-2 text-xs font-semibold text-slate-700">{item.action} →</div>}
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
