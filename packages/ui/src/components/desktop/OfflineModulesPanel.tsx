"use client";

import * as React from "react";
import { AuditLogList } from "../audit/AuditLogList";
import { CustomerProfile } from "../crm/CustomerProfile";
import { DayEndClosePanel } from "../reports/DayEndClose";
import { PaymentsPanel } from "../payments/PaymentsPanel";
import { ReturnsPanel } from "../returns/ReturnsPanel";
import { StaffDetail } from "../staff/StaffDetail";
import { SupplierList } from "../suppliers/SupplierList";
import {
  closeBusinessDay,
  getCustomerCrmProfile,
  listDayEndCloses,
  ordersStore,
  phase5Store,
  phase6Store,
  phase7Store,
  store,
} from "@minarvabiz/business-logic";
import type { NavItemId } from "../../lib/nav";

function persistDesktop() {
  try {
    const fn = (window as unknown as { __minarvaDesktopPersist?: () => Promise<boolean> }).__minarvaDesktopPersist;
    if (fn) void fn();
  } catch {
    // The business-logic mutation already calls touchPersistence().
  }
}

export function OfflineModulesPanel({ activeNav }: { activeNav: NavItemId }) {
  const [, setTick] = React.useState(0);
  const refresh = React.useCallback(() => setTick((v) => v + 1), []);
  const [customerId, setCustomerId] = React.useState("");
  const [staffId, setStaffId] = React.useState("");
  const [supplierQuery, setSupplierQuery] = React.useState("");

  React.useEffect(() => {
    if (activeNav === "customer-crm" && !customerId) setCustomerId(store.listCustomers()[0]?.id || "");
    if (activeNav === "staff-detail" && !staffId) setStaffId(phase6Store.listStaff()[0]?.id || "");
  }, [activeNav, customerId, staffId]);

  if (!["day-end", "payments", "customer-crm", "returns", "suppliers", "staff-detail", "audit"].includes(activeNav)) return null;

  if (activeNav === "day-end") {
    const closes = listDayEndCloses().map((c) => ({
      id: c.id, businessDate: c.businessDate, closedAt: c.closedAt,
      report: { totalSales: c.report.totalSales, netProfit: c.report.netProfit, cashReceived: c.report.cashReceived, outstandingAmount: c.report.outstandingAmount },
      metricsNote: c.metricsNote,
    }));
    return <DayEndClosePanel closes={closes} onCloseDay={() => {
      const result = closeBusinessDay();
      if (!result.record) return { ok: false, error: result.error || "Failed" };
      persistDesktop(); refresh();
      return { ok: true, record: { id: result.record.id, businessDate: result.record.businessDate, closedAt: result.record.closedAt,
        report: { totalSales: result.record.report.totalSales, netProfit: result.record.report.netProfit, cashReceived: result.record.report.cashReceived, outstandingAmount: result.record.report.outstandingAmount },
        metricsNote: result.record.metricsNote } };
    }} />;
  }

  if (activeNav === "payments") {
    const outstanding = store.listCustomers().filter((c) => c.outstandingBalance > 0);
    return <PaymentsPanel outstanding={outstanding} payments={store.listPayments()} onCollect={(data) => {
      const result = store.recordCustomerPayment(data);
      if (!result.errors.length) { persistDesktop(); refresh(); }
      return result.errors.length ? { ok: false, error: result.errors.join("; ") } : { ok: true };
    }} />;
  }

  if (activeNav === "customer-crm") {
    const customers = store.listCustomers();
    const selected = customerId ? getCustomerCrmProfile(customerId) : null;
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-slate-900">Customer CRM</h2>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {selected ? <CustomerProfile profile={selected} onClose={() => setCustomerId("")} /> : <p className="text-sm text-slate-500">Select a customer to view CRM history.</p>}
    </div>;
  }

  if (activeNav === "returns") {
    return <ReturnsPanel returns={phase7Store.listReturns()} sales={phase7Store.listSalesForReturn()} onCreate={(payload) => {
      const result = phase7Store.createReturn(payload);
      if (!result.errors.length) { persistDesktop(); refresh(); }
      return result.errors.length ? { success: false, errors: result.errors } : { success: true };
    }} />;
  }

  if (activeNav === "suppliers") {
    const suppliers = phase5Store.listSuppliers().filter((s) => {
      const q = supplierQuery.trim().toLowerCase();
      return !q || s.name.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q) || s.phone?.includes(q);
    });
    return <SupplierList suppliers={suppliers} onSearch={setSupplierQuery} onAdd={() => setSupplierQuery("")} />;
  }

  if (activeNav === "staff-detail") {
    const staff = phase6Store.listStaff();
    const selected = staff.find((s) => s.id === staffId);
    const assignments = selected ? phase6Store.listAssignments({ staffId: selected.id }) : [];
    const payouts = selected ? phase6Store.listIncentivePayouts(selected.id) : [];
    const rules = phase6Store.listIncentiveRules();
    const productivity = selected ? phase6Store.staffProductivity(selected.id) : { assigned: 0, completed: 0, totalIncentive: 0, unpaidIncentive: 0 };
    const openOrders = ordersStore.listOrders().filter((o) => o.status !== "cancelled" && o.status !== "delivered").map((o) => ({ id: o.id, label: `${o.orderNumber} — ${o.customerName || "Customer"}` }));
    return <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold text-slate-900">Staff Details</h2>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">Select staff</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {selected && <StaffDetail staff={selected} assignments={assignments} payouts={payouts} rules={rules} productivity={productivity}
        ordersForAssign={openOrders}
        onAssign={(orderId) => { const r = phase6Store.assignStaffToOrder({ staffId: selected.id, orderId }); if (!r.errors.length) { persistDesktop(); refresh(); } }}
        onCompleteAssignment={(id) => { if (phase6Store.completeAssignment(id)) { persistDesktop(); refresh(); } }}
        onMarkPaid={(id) => { if (phase6Store.markIncentivePaid(id)) { persistDesktop(); refresh(); } }}
        onClose={() => setStaffId("")} />}
    </div>;
  }

  return <AuditLogList logs={phase7Store.listAuditLogs(500)} />;
}
