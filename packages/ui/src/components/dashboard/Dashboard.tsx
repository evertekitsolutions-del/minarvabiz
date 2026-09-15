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
import { BusinessInsights } from "./BusinessInsights";
import { SalesOverviewChart, type SalesPoint } from "../charts/SalesOverviewChart";
import type { OrderStatusItem } from "./OrderStatusSummary";
import type { CategoryItem } from "./CategoryBreakdown";
import type { BusinessSummaryItem } from "./BusinessSummary";

export interface ProductionControlData {
  totalActive: number;
  unassigned: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  readyToDeliver: number;
  inProduction: number;
  risks: Array<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    status: string;
    deliveryDate: string | null;
    daysUntilDue: number | null;
    assignedStaffName: string | null;
    risk: "overdue" | "due_today" | "due_soon" | "unassigned";
  }>;
  staffLoad: Array<{
    staffId: string;
    staffName: string;
    activeAssignments: number;
    dueSoonAssignments: number;
    overdueAssignments: number;
  }>;
}

export interface CustomerIntelligenceData {
  totalCustomers: number;
  highRiskCount: number;
  followUpCount: number;
  estimatedAnnualValue: number;
  topCustomers: Array<{
    customerId: string;
    customerName: string;
    totalSpend: number;
    loyaltyScore: number;
    segment: string;
    churnRisk: string;
    followUp: string;
  }>;
}

export interface InventoryIntelligenceData {
  totalProducts: number;
  totalStockUnits: number;
  totalStockValue: number;
  reorderProducts: number;
  outOfStockProducts: number;
  deadStockProducts: number;
  overstockedProducts: number;
  estimatedReorderValue: number;
  priorityItems: Array<{
    productId: string;
    name: string;
    stock: number;
    unit: string;
    health: string;
    recommendedOrderQty: number;
    abcClass: string;
    daysOfCover: number | null;
  }>;
}

export interface StaffProductivityData {
  totalActiveAssignments: number;
  totalCompletedAssignments: number;
  overloadedStaff: number;
  averageCompletionRate: number;
  averageOnTimeRate: number;
  staff: Array<{
    staffId: string;
    staffName: string;
    activeAssignments: number;
    completedAssignments: number;
    overdueAssignments: number;
    dueSoonAssignments: number;
    completionRate: number;
    onTimeRate: number;
    averageCompletionDays: number | null;
    workloadScore: number;
    capacityStatus: string;
  }>;
}

export interface DashboardData {
  stats: {
    totalSales: { value: string; change: string; positive: boolean; spark: number[] };
    totalServices: { value: string; change: string; positive: boolean; spark: number[] };
    laundrySales: { value: string; change: string; positive: boolean; spark: number[] };
    totalProfit: { value: string; change: string; positive: boolean; spark: number[] };
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
  productionControl?: ProductionControlData;
  customerIntelligence?: CustomerIntelligenceData;
  inventoryIntelligence?: InventoryIntelligenceData;
  staffProductivity?: StaffProductivityData;
}

export interface DashboardProps {
  data: DashboardData;
  quickActions?: QuickAction[];
  onViewAllOrders?: () => void;
  onViewAllStock?: () => void;
  onInsightAction?: (action: string) => void;
  className?: string;
}

const defaultIcons = {
  cart: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57L22 7H6" />
    </svg>
  ),
  bag: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
  ),
  laundry: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4" /><path d="M12 3v2" /></svg>
  ),
  rupee: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M9 13h5a4 4 0 0 0 0-8" /></svg>
  ),
};

const segmentLabel: Record<string, string> = {
  champion: "Champion", loyal: "Loyal", promising: "Promising", new: "New",
  at_risk: "At risk", lost: "Lost", hibernating: "Hibernating",
};
const followUpLabel: Record<string, string> = {
  overdue_balance: "Payment due", win_back: "Win back", loyalty: "Loyalty", vip: "VIP", welcome: "Welcome",
};
const inventoryHealthLabel: Record<string, string> = {
  out_of_stock: "Out of stock", critical: "Critical", reorder: "Reorder", healthy: "Healthy", overstocked: "Overstocked", dead_stock: "Dead stock",
};

function money(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function Dashboard({ data, quickActions = [], onViewAllOrders, onViewAllStock, onInsightAction, className }: DashboardProps) {
  const { stats, productionControl, customerIntelligence, inventoryIntelligence, staffProductivity } = data;

  return (
    <div className={cn("space-y-5", className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Sales" value={stats.totalSales.value} changeLabel={stats.totalSales.change} changePositive={stats.totalSales.positive} tone="blue" icon={defaultIcons.cart} sparkline={stats.totalSales.spark} />
        <StatCard title="Total Services" value={stats.totalServices.value} changeLabel={stats.totalServices.change} changePositive={stats.totalServices.positive} tone="green" icon={defaultIcons.bag} sparkline={stats.totalServices.spark} />
        <StatCard title="Laundry Sales" value={stats.laundrySales.value} changeLabel={stats.laundrySales.change} changePositive={stats.laundrySales.positive} tone="orange" icon={defaultIcons.laundry} sparkline={stats.laundrySales.spark} />
        <StatCard title="Total Profit" value={stats.totalProfit.value} changeLabel={stats.totalProfit.change} changePositive={stats.totalProfit.positive} tone="purple" icon={defaultIcons.rupee} sparkline={stats.totalProfit.spark} />
      </div>

      {(stats.todayExpenses || stats.pendingOrders || stats.readyOrders || stats.totalCustomers || stats.lowStockCount || stats.outstandingPayments) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.todayExpenses && <StatCard title="Today's Expenses" value={stats.todayExpenses.value} changeLabel={stats.todayExpenses.change} changePositive={stats.todayExpenses.positive} tone="rose" className="!p-3" />}
          {stats.pendingOrders && <StatCard title="Pending Orders" value={stats.pendingOrders.value} tone="orange" className="!p-3" />}
          {stats.readyOrders && <StatCard title="Ready Orders" value={stats.readyOrders.value} tone="green" className="!p-3" />}
          {stats.totalCustomers && <StatCard title="Total Customers" value={stats.totalCustomers.value} tone="blue" className="!p-3" />}
          {stats.lowStockCount && <StatCard title="Low Stock Items" value={stats.lowStockCount.value} tone="rose" className="!p-3" />}
          {stats.outstandingPayments && <StatCard title="Outstanding Payments" value={stats.outstandingPayments.value} tone="slate" className="!p-3" />}
        </div>
      )}

      {customerIntelligence && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Customer Intelligence</h2><p className="mt-1 text-xs text-slate-500">Value, loyalty and retention signals from recorded orders.</p></div><div className="text-xs font-medium text-slate-500">{customerIntelligence.totalCustomers} analysed</div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-blue-50 p-3"><div className="text-[11px] font-medium text-blue-600">Estimated annual value</div><div className="mt-1 text-xl font-bold text-blue-800">{money(customerIntelligence.estimatedAnnualValue)}</div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[11px] font-medium text-emerald-600">Healthy customers</div><div className="mt-1 text-xl font-bold text-emerald-700">{Math.max(0, customerIntelligence.totalCustomers - customerIntelligence.highRiskCount)}</div></div>
            <div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-medium text-rose-600">High churn risk</div><div className="mt-1 text-xl font-bold text-rose-700">{customerIntelligence.highRiskCount}</div></div>
            <div className="rounded-xl bg-violet-50 p-3"><div className="text-[11px] font-medium text-violet-600">Follow-up opportunities</div><div className="mt-1 text-xl font-bold text-violet-700">{customerIntelligence.followUpCount}</div></div>
          </div>
          {customerIntelligence.topCustomers.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Highest-value customer signals</div><div className="divide-y divide-slate-100">{customerIntelligence.topCustomers.slice(0, 5).map((customer) => <div key={customer.customerId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><div className="min-w-0"><div className="font-semibold text-slate-900">{customer.customerName}</div><div className="mt-0.5 text-slate-500">{money(customer.totalSpend)} spend · {segmentLabel[customer.segment] || customer.segment} · {customer.loyaltyScore}/100 loyalty</div></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{customer.churnRisk} risk</span>{customer.followUp !== "none" && <span className="rounded-full bg-violet-50 px-2 py-1 font-semibold text-violet-700">{followUpLabel[customer.followUp] || customer.followUp}</span>}</div></div>)}</div></div>}
        </section>
      )}

      {inventoryIntelligence && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Inventory Intelligence</h2><p className="mt-1 text-xs text-slate-500">Velocity, stock cover and reorder planning from the last 90 days.</p></div><div className="text-xs font-medium text-slate-500">{inventoryIntelligence.totalProducts} products</div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-medium text-slate-500">Stock units</div><div className="mt-1 text-xl font-bold text-slate-900">{Math.round(inventoryIntelligence.totalStockUnits * 100) / 100}</div></div>
            <div className="rounded-xl bg-blue-50 p-3"><div className="text-[11px] font-medium text-blue-600">Stock value</div><div className="mt-1 text-xl font-bold text-blue-800">{money(inventoryIntelligence.totalStockValue)}</div></div>
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-[11px] font-medium text-amber-700">Reorder</div><div className="mt-1 text-xl font-bold text-amber-800">{inventoryIntelligence.reorderProducts}</div></div>
            <div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-medium text-rose-600">Out of stock</div><div className="mt-1 text-xl font-bold text-rose-700">{inventoryIntelligence.outOfStockProducts}</div></div>
            <div className="rounded-xl bg-violet-50 p-3"><div className="text-[11px] font-medium text-violet-600">Dead stock</div><div className="mt-1 text-xl font-bold text-violet-700">{inventoryIntelligence.deadStockProducts}</div></div>
            <div className="rounded-xl bg-orange-50 p-3"><div className="text-[11px] font-medium text-orange-600">Overstocked</div><div className="mt-1 text-xl font-bold text-orange-700">{inventoryIntelligence.overstockedProducts}</div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[11px] font-medium text-emerald-600">Suggested order</div><div className="mt-1 text-xl font-bold text-emerald-700">{money(inventoryIntelligence.estimatedReorderValue)}</div></div>
          </div>
          {inventoryIntelligence.priorityItems.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Priority inventory actions</div><div className="divide-y divide-slate-100">{inventoryIntelligence.priorityItems.map((item) => <div key={item.productId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><div className="min-w-0"><div className="font-semibold text-slate-900">{item.name} <span className="font-normal text-slate-400">ABC {item.abcClass}</span></div><div className="mt-0.5 text-slate-500">{item.stock} {item.unit} · {item.daysOfCover == null ? "No sales in window" : `${Math.round(item.daysOfCover)} days cover`} · order +{item.recommendedOrderQty}</div></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{inventoryHealthLabel[item.health] || item.health}</span></div>)}</div></div>}
        </section>
      )}

      {staffProductivity && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Staff Productivity & Capacity</h2><p className="mt-1 text-xs text-slate-500">Workload, completion velocity and on-time delivery signals from assignments.</p></div><div className="text-xs font-medium text-slate-500">{staffProductivity.staff.length} active staff</div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-medium text-slate-500">Active jobs</div><div className="mt-1 text-xl font-bold text-slate-900">{staffProductivity.totalActiveAssignments}</div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[11px] font-medium text-emerald-600">Completed</div><div className="mt-1 text-xl font-bold text-emerald-700">{staffProductivity.totalCompletedAssignments}</div></div>
            <div className="rounded-xl bg-orange-50 p-3"><div className="text-[11px] font-medium text-orange-600">Avg completion</div><div className="mt-1 text-xl font-bold text-orange-700">{Math.round(staffProductivity.averageCompletionRate)}%</div></div>
            <div className="rounded-xl bg-blue-50 p-3"><div className="text-[11px] font-medium text-blue-600">Avg on-time</div><div className="mt-1 text-xl font-bold text-blue-700">{Math.round(staffProductivity.averageOnTimeRate)}%</div></div>
            <div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-medium text-rose-600">Overloaded staff</div><div className="mt-1 text-xl font-bold text-rose-700">{staffProductivity.overloadedStaff}</div></div>
          </div>
          {staffProductivity.staff.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><div className="min-w-[760px]"><div className="grid grid-cols-[1.5fr_repeat(5,minmax(80px,1fr))] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600"><div>Staff</div><div>Active</div><div>Done</div><div>On-time</div><div>Load</div><div>Status</div></div><div className="divide-y divide-slate-100">{staffProductivity.staff.map((member) => <div key={member.staffId} className="grid grid-cols-[1.5fr_repeat(5,minmax(80px,1fr))] gap-2 px-3 py-2.5 text-xs"><div className="font-semibold text-slate-900">{member.staffName}<div className="font-normal text-slate-500">{member.overdueAssignments ? `${member.overdueAssignments} overdue` : member.dueSoonAssignments ? `${member.dueSoonAssignments} due soon` : "On track"}</div></div><div>{member.activeAssignments}</div><div>{member.completedAssignments}</div><div>{Math.round(member.onTimeRate)}%</div><div>{Math.round(member.workloadScore)}</div><div><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{member.capacityStatus}</span></div></div>)}</div></div></div>}
        </section>
      )}

      {productionControl && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">Production Control Center</h2><p className="mt-1 text-xs text-slate-500">Live workload, delivery risk and tailor capacity from current service orders.</p></div><div className="text-xs font-medium text-slate-500">{productionControl.totalActive} active orders</div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-medium text-slate-500">In production</div><div className="mt-1 text-xl font-bold text-slate-900">{productionControl.inProduction}</div></div>
            <div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-medium text-rose-600">Overdue</div><div className="mt-1 text-xl font-bold text-rose-700">{productionControl.overdue}</div></div>
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-[11px] font-medium text-amber-700">Due today</div><div className="mt-1 text-xl font-bold text-amber-800">{productionControl.dueToday}</div></div>
            <div className="rounded-xl bg-orange-50 p-3"><div className="text-[11px] font-medium text-orange-700">Due ≤2 days</div><div className="mt-1 text-xl font-bold text-orange-800">{productionControl.dueSoon}</div></div>
            <div className="rounded-xl bg-blue-50 p-3"><div className="text-[11px] font-medium text-blue-600">Unassigned</div><div className="mt-1 text-xl font-bold text-blue-700">{productionControl.unassigned}</div></div>
            <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[11px] font-medium text-emerald-600">Ready</div><div className="mt-1 text-xl font-bold text-emerald-700">{productionControl.readyToDeliver}</div></div>
            <div className="rounded-xl bg-violet-50 p-3"><div className="text-[11px] font-medium text-violet-600">Risk queue</div><div className="mt-1 text-xl font-bold text-violet-700">{productionControl.risks.length}</div></div>
            <div className="rounded-xl bg-slate-100 p-3"><div className="text-[11px] font-medium text-slate-500">Tailor loads</div><div className="mt-1 text-xl font-bold text-slate-900">{productionControl.staffLoad.length}</div></div>
          </div>
          {productionControl.risks.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">Priority queue</div><div className="divide-y divide-slate-100">{productionControl.risks.slice(0, 5).map((risk) => { const label = risk.risk === "overdue" ? "Overdue" : risk.risk === "due_today" ? "Due today" : risk.risk === "due_soon" ? "Due soon" : "Unassigned"; const detail = risk.assignedStaffName ? `Assigned to ${risk.assignedStaffName}` : "No staff assigned"; return <div key={`${risk.orderId}-${risk.risk}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs"><div className="min-w-0"><div className="font-semibold text-slate-900">{risk.orderNumber} · {risk.customerName}</div><div className="mt-0.5 text-slate-500">{risk.status} · {detail}</div></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{label}</span></div>; })}</div></div>}
        </section>
      )}

      <BusinessInsights data={data} onAction={onInsightAction} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12"><div className="xl:col-span-6"><SalesOverviewChart data={data.salesSeries} /></div><div className="xl:col-span-3"><BusinessSummary items={data.businessSummary} netProfit={data.netProfit} /></div><div className="xl:col-span-3"><OrderStatusSummary items={data.orderStatus} /></div></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12"><div className="lg:col-span-4"><CategoryBreakdown items={data.categories} /></div><div className="lg:col-span-5"><RecentOrders rows={data.recentOrders} onViewAll={onViewAllOrders} /></div><div className="lg:col-span-3"><LowStockAlert items={data.lowStock} onViewAll={onViewAllStock} /></div></div>
      {quickActions.length > 0 && <QuickActions actions={quickActions} />}
    </div>
  );
}
