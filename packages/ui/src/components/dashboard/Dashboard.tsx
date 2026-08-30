"use client";

import * as React from "react";
import { cn } from "../../lib/cn";
import { StatCard } from "./StatCard";
import { BusinessSummary } from "./BusinessSummary";
import { OrderStatusSummary } from "./OrderStatusSummary";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { RecentOrders, type RecentOrderRow } from "./RecentOrders";
import { LowStockAlert, type LowStockItem } from "./LowStockAlert";
import { QuickActions, type QuickAction } from "./QuickActions";
import { SalesOverviewChart, type SalesPoint } from "../charts/SalesOverviewChart";
import type { OrderStatusItem } from "./OrderStatusSummary";
import type { CategoryItem } from "./CategoryBreakdown";
import type { BusinessSummaryItem } from "./BusinessSummary";

/** Dashboard data contract — wire to Supabase / SQLite repositories */
export interface DashboardData {
  stats: {
    totalSales: { value: string; change: string; positive: boolean; spark: number[] };
    totalServices: { value: string; change: string; positive: boolean; spark: number[] };
    laundrySales: { value: string; change: string; positive: boolean; spark: number[] };
    totalProfit: { value: string; change: string; positive: boolean; spark: number[] };
    /** Extra cards from requirements */
    todayExpenses?: { value: string; change?: string; positive?: boolean };
    pendingOrders?: { value: string };
    readyOrders?: { value: string };
    totalCustomers?: { value: string };
    lowStockCount?: { value: string };
    outstandingPayments?: { value: string };
  };
  salesSeries: SalesPoint[];
  businessSummary: BusinessSummaryItem[];
  netProfit: { label: string; value: string };
  orderStatus: OrderStatusItem[];
  categories: CategoryItem[];
  recentOrders: RecentOrderRow[];
  lowStock: LowStockItem[];
}

export interface DashboardProps {
  data: DashboardData;
  quickActions?: QuickAction[];
  onViewAllOrders?: () => void;
  onViewAllStock?: () => void;
  className?: string;
}

const defaultIcons = {
  cart: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57L22 7H6" />
    </svg>
  ),
  bag: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  laundry: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2" />
    </svg>
  ),
  rupee: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12M6 8h12M6 13l8.5 8M9 13h5a4 4 0 0 0 0-8" />
    </svg>
  ),
};

export function Dashboard({
  data,
  quickActions = [],
  onViewAllOrders,
  onViewAllStock,
  className,
}: DashboardProps) {
  const { stats } = data;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Primary KPI row — matches reference */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Sales"
          value={stats.totalSales.value}
          changeLabel={stats.totalSales.change}
          changePositive={stats.totalSales.positive}
          tone="blue"
          icon={defaultIcons.cart}
          sparkline={stats.totalSales.spark}
        />
        <StatCard
          title="Total Services"
          value={stats.totalServices.value}
          changeLabel={stats.totalServices.change}
          changePositive={stats.totalServices.positive}
          tone="green"
          icon={defaultIcons.bag}
          sparkline={stats.totalServices.spark}
        />
        <StatCard
          title="Laundry Sales"
          value={stats.laundrySales.value}
          changeLabel={stats.laundrySales.change}
          changePositive={stats.laundrySales.positive}
          tone="orange"
          icon={defaultIcons.laundry}
          sparkline={stats.laundrySales.spark}
        />
        <StatCard
          title="Total Profit"
          value={stats.totalProfit.value}
          changeLabel={stats.totalProfit.change}
          changePositive={stats.totalProfit.positive}
          tone="purple"
          icon={defaultIcons.rupee}
          sparkline={stats.totalProfit.spark}
        />
      </div>

      {/* Secondary metrics row (requirements) */}
      {(stats.todayExpenses ||
        stats.pendingOrders ||
        stats.readyOrders ||
        stats.totalCustomers ||
        stats.lowStockCount ||
        stats.outstandingPayments) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.todayExpenses && (
            <StatCard
              title="Today's Expenses"
              value={stats.todayExpenses.value}
              changeLabel={stats.todayExpenses.change}
              changePositive={stats.todayExpenses.positive}
              tone="rose"
              className="!p-3"
            />
          )}
          {stats.pendingOrders && (
            <StatCard title="Pending Orders" value={stats.pendingOrders.value} tone="orange" className="!p-3" />
          )}
          {stats.readyOrders && (
            <StatCard title="Ready Orders" value={stats.readyOrders.value} tone="green" className="!p-3" />
          )}
          {stats.totalCustomers && (
            <StatCard title="Total Customers" value={stats.totalCustomers.value} tone="blue" className="!p-3" />
          )}
          {stats.lowStockCount && (
            <StatCard title="Low Stock Items" value={stats.lowStockCount.value} tone="rose" className="!p-3" />
          )}
          {stats.outstandingPayments && (
            <StatCard
              title="Outstanding Payments"
              value={stats.outstandingPayments.value}
              tone="slate"
              className="!p-3"
            />
          )}
        </div>
      )}

      {/* Charts + summaries */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <SalesOverviewChart data={data.salesSeries} />
        </div>
        <div className="xl:col-span-3">
          <BusinessSummary items={data.businessSummary} netProfit={data.netProfit} />
        </div>
        <div className="xl:col-span-3">
          <OrderStatusSummary items={data.orderStatus} />
        </div>
      </div>

      {/* Categories + orders + low stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <CategoryBreakdown items={data.categories} />
        </div>
        <div className="lg:col-span-5">
          <RecentOrders rows={data.recentOrders} onViewAll={onViewAllOrders} />
        </div>
        <div className="lg:col-span-3">
          <LowStockAlert items={data.lowStock} onViewAll={onViewAllStock} />
        </div>
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 && <QuickActions actions={quickActions} />}
    </div>
  );
}
