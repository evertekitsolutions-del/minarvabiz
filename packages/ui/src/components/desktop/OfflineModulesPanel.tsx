"use client";

import * as React from "react";
import { AuditLogList } from "../audit/AuditLogList";
import { CustomerProfile } from "../crm/CustomerProfile";
import { DayEndClosePanel } from "../reports/DayEndClose";
import { PaymentsPanel } from "../payments/PaymentsPanel";
import { ReturnsPanel } from "../returns/ReturnsPanel";
import { StaffDetail } from "../staff/StaffDetail";
import { SupplierList } from "../suppliers/SupplierList";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { Modal } from "../forms/Modal";
import { closeBusinessDay, listDayEndCloses, ordersStore, phase5Store, phase6Store, phase7Store, store } from "@minarvabiz/business-logic";
import type { NavItemId } from "../../lib/nav";
import type { PaymentMethod, Supplier } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }

function persistDesktop() {
  try {
    const fn = (window as unknown as { __minarvaDesktopPersist?: () => Promise<boolean> }).__minarvaDesktopPersist;
    if (fn) void fn();
  } catch {
    // The business-logic mutation already calls touchPersistence().
  }
}

export function OfflineModulesPanel({
  activeNav,
  preferredCustomerId,
  preferredStaffId,
}: {
  activeNav: NavItemId;
  preferredCustomerId?: string;
  preferredStaffId?: string;
}) {
  const [, setTick] = React.useState(0);
  const refresh = React.useCallback(() => setTick((v) => v + 1), []);
  const [customerId, setCustomerId] = React.useState("");
  const [staffId, setStaffId] = React.useState("");
  const [supplierQuery, setSupplierQuery] = React.useState("");
  const [supplierOpen, setSupplierOpen] = React.useState(false);
  const [supplierForm, setSupplierForm] = React.useState({ name: "", company: "", phone: "", email: "", address: "", category: "", openingBalance: "", notes: "" });
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [supplierPaymentOpen, setSupplierPaymentOpen] = React.useState(false);
  const [supplierPaymentTarget, setSupplierPaymentTarget] = React.useState<Supplier | null>(null);
  const [supplierPaymentForm, setSupplierPaymentForm] = React.useState({ date: todayLocal(), amount: "", paymentMethod: "cash" as PaymentMethod, reference: "", notes: "" });
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (activeNav === "customer-crm") {
      if (preferredCustomerId) setCustomerId(preferredCustomerId);
      else if (!customerId) setCustomerId(store.listCustomers()[0]?.id || "");
    }
    if (activeNav === "staff-detail") {
      if (preferredStaffId) setStaffId(preferredStaffId);
      else if (!staffId) setStaffId(phase6Store.listStaff()[0]?.id || "");
    }
    setActionError(null);
  }, [activeNav, customerId, staffId, preferredCustomerId, preferredStaffId]);

  if (!["day-end", "payments", "customer-crm", "returns", "suppliers", "staff-detail", "audit"].includes(activeNav)) return null;

  if (activeNav === "day-end") {
    const closes = listDayEndCloses().map((c) => ({ id: c.id, businessDate: c.businessDate, closedAt: c.closedAt, report: { totalSales: c.report.totalSales, netProfit: c.report.netProfit, cashReceived: c.report.cashReceived, outstandingAmount: c.report.outstandingAmount }, metricsNote: c.metricsNote }));
    return <DayEndClosePanel closes={closes} onCloseDay={() => {
      try {
        const result = closeBusinessDay();
        if (!result.record) return { ok: false, error: result.error || "Failed" };
        setActionError(null); persistDesktop(); refresh();
        return { ok: true, record: { id: result.record.id, businessDate: result.record.businessDate, closedAt: result.record.closedAt, report: { totalSales: result.record.report.totalSales, netProfit: result.record.report.netProfit, cashReceived: result.record.report.cashReceived, outstandingAmount: result.record.report.outstandingAmount }, metricsNote: result.record.metricsNote } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActionError(message);
        return { ok: false, error: message };
      }
    }} />;
  }

  if (activeNav === "payments") {
    const outstanding = store.listCustomers().filter((c) => c.outstandingBalance > 0);
    return <><PaymentsPanel outstanding={outstanding} payments={store.listPayments().filter((p) => p.referenceType !== "supplier")} onCollect={(data) => {
      try {
        const result = store.recordCustomerPayment(data);
        if (!result.errors.length) { setActionError(null); persistDesktop(); refresh(); }
        return result.errors.length ? { ok: false, error: result.errors.join("; ") } : { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActionError(message);
        return { ok: false, error: message };
      }
    }} />{actionError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}</>;
  }

  if (activeNav === "customer-crm") {
    const customers = store.listCustomers();
    const selected = customerId ? phase6Store.getCustomerCrmProfile(customerId) : null;
    return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold text-slate-900">Customer CRM</h2><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>{selected ? <CustomerProfile profile={selected} onClose={() => setCustomerId("")} /> : <p className="text-sm text-slate-500">Select a customer to view CRM history.</p>}</div>;
  }

  if (activeNav === "returns") {
    return <><ReturnsPanel returns={phase7Store.listReturns()} sales={phase7Store.listSalesForReturn()} onCreate={(payload) => {
      try {
        const result = phase7Store.createReturn(payload);
        if (!result.errors.length) { setActionError(null); persistDesktop(); refresh(); }
        return result.errors.length ? { success: false, errors: result.errors } : { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActionError(message);
        return { success: false, errors: [message] };
      }
    }} />{actionError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}</>;
  }

  if (activeNav === "suppliers") {
    const suppliers = phase5Store.listSuppliers().filter((s) => { const q = supplierQuery.trim().toLowerCase(); return !q || s.name.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q) || s.phone?.includes(q); });
    const openPayment = (supplier: Supplier) => { setActionError(null); setSupplierPaymentTarget(supplier); setSupplierPaymentForm({ date: todayLocal(), amount: String(supplier.outstandingBalance), paymentMethod: "cash", reference: "", notes: "" }); setSupplierPaymentOpen(true); };
    return <><SupplierList suppliers={suppliers} onSearch={setSupplierQuery} onAdd={() => { setSupplierError(null); setSupplierForm({ name: "", company: "", phone: "", email: "", address: "", category: "", openingBalance: "", notes: "" }); setSupplierOpen(true); }} onPay={openPayment} />
      <Modal open={supplierOpen} title="Add Supplier" onClose={() => setSupplierOpen(false)} footer={<><Button variant="outline" onClick={() => setSupplierOpen(false)}>Cancel</Button><Button onClick={() => { try { if (!supplierForm.name.trim()) throw new Error("Supplier name is required"); phase5Store.createSupplier({ name: supplierForm.name.trim(), company: supplierForm.company.trim() || null, phone: supplierForm.phone.trim() || null, email: supplierForm.email.trim() || null, address: supplierForm.address.trim() || null, category: supplierForm.category.trim() || null, openingBalance: parseFloat(supplierForm.openingBalance) || 0, notes: supplierForm.notes.trim() || null }); setSupplierOpen(false); setSupplierError(null); persistDesktop(); refresh(); } catch (e) { setSupplierError(e instanceof Error ? e.message : String(e)); } }}>Save Supplier</Button></>}><div className="grid gap-4 sm:grid-cols-2"><FormField label="Supplier name *"><input className={inputClass} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></FormField><FormField label="Company"><input className={inputClass} value={supplierForm.company} onChange={(e) => setSupplierForm({ ...supplierForm, company: e.target.value })} /></FormField><FormField label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></FormField><FormField label="Email"><input className={inputClass} type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></FormField><FormField label="Address" className="sm:col-span-2"><textarea className={inputClass + " h-auto py-2"} rows={2} value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></FormField><FormField label="Category"><select className={selectClass} value={supplierForm.category} onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}><option value="">General</option><option value="materials">Materials</option><option value="laundry">Laundry</option><option value="general">General</option></select></FormField><FormField label="Opening balance"><input className={inputClass} type="number" min="0" step="0.01" value={supplierForm.openingBalance} onChange={(e) => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })} /></FormField><FormField label="Notes" className="sm:col-span-2"><textarea className={inputClass + " h-auto py-2"} rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></FormField>{supplierError && <p className="text-sm text-rose-600 sm:col-span-2">{supplierError}</p>}</div></Modal>
      <Modal open={supplierPaymentOpen} title="Record Supplier Payment" onClose={() => setSupplierPaymentOpen(false)} footer={<><Button variant="outline" onClick={() => setSupplierPaymentOpen(false)}>Cancel</Button><Button onClick={() => { try { if (!supplierPaymentTarget) return; const result = phase5Store.recordSupplierPayment({ supplierId: supplierPaymentTarget.id, amount: parseFloat(supplierPaymentForm.amount) || 0, paymentMethod: supplierPaymentForm.paymentMethod, date: supplierPaymentForm.date, reference: supplierPaymentForm.reference || null, notes: supplierPaymentForm.notes || null }); if (result.errors.length) { setActionError(result.errors.join("; ")); return; } setSupplierPaymentOpen(false); setActionError(null); persistDesktop(); refresh(); } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); } }}>Record Payment</Button></>}><div className="space-y-3"><p className="text-sm text-slate-600">{supplierPaymentTarget?.name} · Outstanding <strong>{supplierPaymentTarget?.outstandingBalance.toFixed(2)}</strong></p><FormField label="Date"><input type="date" className={inputClass} value={supplierPaymentForm.date} onChange={(e) => setSupplierPaymentForm({ ...supplierPaymentForm, date: e.target.value })}/></FormField><FormField label="Amount"><input type="number" min="0" step="0.01" className={inputClass} value={supplierPaymentForm.amount} onChange={(e) => setSupplierPaymentForm({ ...supplierPaymentForm, amount: e.target.value })}/></FormField><FormField label="Payment method"><select className={selectClass} value={supplierPaymentForm.paymentMethod} onChange={(e) => setSupplierPaymentForm({ ...supplierPaymentForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option></select></FormField><FormField label="Reference"><input className={inputClass} value={supplierPaymentForm.reference} onChange={(e) => setSupplierPaymentForm({ ...supplierPaymentForm, reference: e.target.value })}/></FormField><FormField label="Notes"><input className={inputClass} value={supplierPaymentForm.notes} onChange={(e) => setSupplierPaymentForm({ ...supplierPaymentForm, notes: e.target.value })}/></FormField>{actionError && <p className="text-sm text-rose-600">{actionError}</p>}</div></Modal>
    </>;
  }

  if (activeNav === "staff-detail") {
    const staff = phase6Store.listStaff();
    const selected = staff.find((s) => s.id === staffId);
    const assignments = selected ? phase6Store.listAssignments({ staffId: selected.id }) : [];
    const payouts = selected ? phase6Store.listIncentivePayouts(selected.id) : [];
    const rules = phase6Store.listIncentiveRules();
    const productivity = selected ? phase6Store.staffProductivity(selected.id) : { assigned: 0, completed: 0, totalIncentive: 0, unpaidIncentive: 0 };
    const openOrders = ordersStore.listOrders().filter((o) => o.status !== "cancelled" && o.status !== "delivered").map((o) => ({ id: o.id, label: `${o.orderNumber} — ${o.customerName || "Customer"}` }));
    return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold text-slate-900">Staff Details</h2><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">Select staff</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>{selected && <StaffDetail staff={selected} assignments={assignments} payouts={payouts} rules={rules} productivity={productivity} ordersForAssign={openOrders} onAssign={(orderId) => { try { const r = phase6Store.assignStaffToOrder({ staffId: selected.id, orderId }); if (r.errors.length) { setActionError(r.errors.join("; ")); return; } setActionError(null); persistDesktop(); refresh(); } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); } }} onCompleteAssignment={(id) => { try { if (phase6Store.completeAssignment(id)) { setActionError(null); persistDesktop(); refresh(); } } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); } }} onMarkPaid={(id) => { try { if (phase6Store.markIncentivePaid(id)) { setActionError(null); persistDesktop(); refresh(); } } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); } }} onClose={() => setStaffId("")} />}{actionError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}</div>;
  }

  return <AuditLogList logs={phase7Store.listAuditLogs(500)} />;
}
