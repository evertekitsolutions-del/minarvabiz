"use client";

import * as React from "react";
import type { AuditLogEntry, ExpenseCategory, MeasurementProfile, PaymentMethod, ServiceOrder, OrderStatus, StaffAssignment, StaffMember } from "@minarvabiz/types";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass } from "../forms/FormField";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";
import type { TemplateId } from "@minarvabiz/business-logic";
import { canCollectServiceOrderBalance } from "./service-order-collection";
import {
  SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_FLOW,
  measurementRevisionHistory, ordersStore, buildOrderInvoiceHtml, requestOrderInvoicePrint, canAssignServiceOrder,
  canStartServiceAssignment, canCompleteServiceAssignment, availableServiceWhatsAppTemplates,
} from "@minarvabiz/business-logic";

function auditReason(entry: AuditLogEntry): string | null {
  if (!entry.newValue) return null;
  try {
    const parsed = JSON.parse(entry.newValue) as Record<string, unknown>;
    const reason = parsed.changeReason ?? parsed.cancellationReason ?? parsed.reason;
    return typeof reason === "string" && reason.trim() ? reason : null;
  } catch {
    return null;
  }
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "service_order.create": "Order created",
    "service_order.update": "Operational details updated",
    "service_order.status": "Status changed",
    "service_order.cancel": "Order cancelled",
    "service_order.collection": "Payment collected",
    "service_order.quality_check": "Quality check updated",
  };
  return labels[action] ?? action.replaceAll("_", " ").replaceAll(".", " · ");
}

function measurementLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

export function OrderDetail({
  order,
  measurementProfiles,
  onStatusChange,
  onQualityCheck,
  expenseCategories = [],
  onAddExpense,
  onUpdateOperationalDetails,
  onCollectBalance,
  staffMembers = [],
  staffAssignments = [],
  canAssignStaff = false,
  onAssignStaff,
  onStartAssignment,
  onCompleteAssignment,
  onShareWhatsApp,
  auditHistory = [],
  onClose,
}: {
  order: ServiceOrder;
  measurementProfiles?: MeasurementProfile[];
  onStatusChange?: (status: OrderStatus, options?: { refundPaymentMethod?: PaymentMethod; reason?: string }) => void;
  onQualityCheck?: (input: { passed: boolean; notes: string; issues: string[] }) => void;
  expenseCategories?: ExpenseCategory[];
  onAddExpense?: (input: { description: string; amount: number; categoryId: string; paymentMethod: PaymentMethod }) => void;
  onUpdateOperationalDetails?: (input: { deliveryDate: string | null; notes: string | null; materialDetails: string | null }, reason: string) => void;
  onCollectBalance?: (order: ServiceOrder) => void;
  staffMembers?: StaffMember[];
  staffAssignments?: StaffAssignment[];
  canAssignStaff?: boolean;
  onAssignStaff?: (staffId: string) => { ok: boolean; error?: string };
  onStartAssignment?: (assignmentId: string) => { ok: boolean; error?: string };
  onCompleteAssignment?: (assignmentId: string) => { ok: boolean; error?: string };
  onShareWhatsApp?: (templateId: TemplateId) => { ok: boolean; error?: string };
  auditHistory?: AuditLogEntry[];
  onClose?: () => void;
}) {
  const [expDesc, setExpDesc] = React.useState("");
  const [expAmt, setExpAmt] = React.useState("");
  const [expCategoryId, setExpCategoryId] = React.useState("");
  const [expPaymentMethod, setExpPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [refundPaymentMethod, setRefundPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [qcNotes, setQcNotes] = React.useState("");
  const [qcIssue, setQcIssue] = React.useState("");
  const [qcIssues, setQcIssues] = React.useState<string[]>([]);
  const [printPreviewPaper, setPrintPreviewPaper] = React.useState<"a4" | "thermal" | null>(null);
  const [printNotice, setPrintNotice] = React.useState<{ state: "ok" | "error"; message: string } | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [staffToAssign, setStaffToAssign] = React.useState("");
  const [staffAssignError, setStaffAssignError] = React.useState<string | null>(null);
  const [whatsAppTemplate, setWhatsAppTemplate] = React.useState<TemplateId>("order_received");
  const [whatsAppError, setWhatsAppError] = React.useState<string | null>(null);
  const [editDeliveryDate, setEditDeliveryDate] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editMaterialDetails, setEditMaterialDetails] = React.useState("");
  const [editReason, setEditReason] = React.useState("");
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  function printServiceInvoice(paper: "a4" | "thermal") {
    setPrintNotice(null);
    // Dispatch synchronously from the click handler to avoid browser popup blocking.
    void requestOrderInvoicePrint(order, paper).then((result) => {
      setPrintNotice({
        state: result.ok ? "ok" : "error",
        message: result.ok
          ? result.state === "native-accepted"
            ? `Service invoice ${order.orderNumber} saved. Printer accepted the request; check physical output.`
            : `Service invoice ${order.orderNumber} saved. Print window opened; complete the print dialog.`
          : `Service invoice ${order.orderNumber} was not printed: ${result.error}`,
      });
      setPrintPreviewPaper(null);
    }).catch((error: unknown) => {
      setPrintNotice({
        state: "error",
        message: `Service invoice ${order.orderNumber} was not printed: ${error instanceof Error ? error.message : String(error)}`,
      });
      setPrintPreviewPaper(null);
    });
  }

  const profit = {
    revenue: order.price,
    materialCost: order.externalMaterialCost,
    orderSpecificExpenses: order.orderExpensesTotal,
    totalCost: order.externalMaterialCost + order.orderExpensesTotal,
    grossProfit: order.price - order.externalMaterialCost - order.orderExpensesTotal,
  };
  const profiles = measurementProfiles ?? ordersStore.listMeasurementProfiles(order.customerId);
  const selectedProfile = order.measurementProfileId
    ? profiles.find((profile) => profile.id === order.measurementProfileId) ?? null
    : null;
  const measurementHistory = selectedProfile
    ? measurementRevisionHistory(profiles, selectedProfile)
    : [];
  const qualityCheck = order.qualityCheck ?? null;

  const assignedStaffIds = new Set(
    staffAssignments.filter((assignment) => assignment.status !== "cancelled").map((assignment) => assignment.staffId),
  );
  const availableStaff = staffMembers.filter((member) => member.status === "active" && !assignedStaffIds.has(member.id));
  const canAssignToThisOrder = canAssignStaff && canAssignServiceOrder(order);
  const whatsAppOptions = availableServiceWhatsAppTemplates(order);
  const selectedWhatsAppTemplate = whatsAppOptions.find((item) => item.id === whatsAppTemplate)?.id
    ?? whatsAppOptions[0]?.id;
  function shareStatusViaWhatsApp() {
    if (!selectedWhatsAppTemplate || !onShareWhatsApp) return;
    const result = onShareWhatsApp(selectedWhatsAppTemplate);
    if (!result.ok) {
      setWhatsAppError(result.error || "Could not prepare WhatsApp message.");
      return;
    }
    setWhatsAppError(null);
  }


  function submitStaffAssignment() {
    if (!onAssignStaff || !staffToAssign || !availableStaff.some((member) => member.id === staffToAssign)) return;
    const result = onAssignStaff(staffToAssign);
    if (!result.ok) {
      setStaffAssignError(result.error || "Unable to assign staff.");
      return;
    }
    setStaffToAssign("");
    setStaffAssignError(null);
  }

  function transitionStaffAssignment(assignment: StaffAssignment, action: "start" | "complete") {
    const allowed = action === "start"
      ? canStartServiceAssignment(assignment, order)
      : canCompleteServiceAssignment(assignment, order);
    if (!canAssignStaff || !allowed) return;
    const callback = action === "start" ? onStartAssignment : onCompleteAssignment;
    if (!callback) return;
    const result = callback(assignment.id);
    if (!result.ok) {
      setStaffAssignError(result.error || "Unable to change staff assignment.");
      return;
    }
    setStaffAssignError(null);
  }

  function openOperationalEditor() {
    setEditDeliveryDate(order.deliveryDate ? String(order.deliveryDate).slice(0, 10) : "");
    setEditNotes(order.notes ?? "");
    setEditMaterialDetails(order.materialDetails ?? "");
    setEditReason("");
    setEditOpen(true);
  }

  function saveOperationalEdit() {
    if (!onUpdateOperationalDetails || editReason.trim().length < 3) return;
    onUpdateOperationalDetails({
      deliveryDate: editDeliveryDate || null,
      notes: editNotes.trim() || null,
      materialDetails: editMaterialDetails.trim() || null,
    }, editReason.trim());
    setEditOpen(false);
  }

  function addQcIssue() {
    const issue = qcIssue.trim();
    if (!issue) return;
    if (!qcIssues.includes(issue)) setQcIssues((items) => [...items, issue]);
    setQcIssue("");
  }

  function submitQc(passed: boolean) {
    onQualityCheck?.({ passed, notes: qcNotes.trim(), issues: qcIssues });
    setQcNotes("");
    setQcIssue("");
    setQcIssues([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{order.orderNumber}</h2>
          <p className="text-sm text-slate-500">
            {order.customerName} · {SERVICE_TYPE_LABELS[order.serviceType]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onCollectBalance && canCollectServiceOrderBalance(order) && (
            <Button variant="outline" onClick={() => onCollectBalance(order)}>Collect Customer Due</Button>
          )}
          <Button variant="outline" onClick={() => setPrintPreviewPaper("a4")}>Preview A4</Button>
          <Button variant="outline" onClick={() => setPrintPreviewPaper("thermal")}>Preview Thermal</Button>
          {onUpdateOperationalDetails && order.status !== "delivered" && order.status !== "cancelled" && (
            <Button variant="outline" onClick={openOperationalEditor}>Edit / Reschedule</Button>
          )}
          {onClose && <Button variant="outline" onClick={onClose}>Close</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ORDER_STATUS_FLOW.map((s) => {
          const active = order.status === s;
          const done =
            ORDER_STATUS_FLOW.indexOf(order.status) > ORDER_STATUS_FLOW.indexOf(s) ||
            order.status === "delivered";
          return (
            <button
              key={s}
              type="button"
              disabled={!onStatusChange || order.status === "cancelled" || order.status === "delivered"}
              onClick={() => onStatusChange?.(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                active
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : done
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-50 text-slate-500 ring-slate-200"
              }`}
            >
              {ORDER_STATUS_LABELS[s]}
            </button>
          );
        })}
        {order.status !== "cancelled" && order.status !== "delivered" && onStatusChange && (
          order.advance > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Service order refund payment method"
                value={refundPaymentMethod}
                onChange={(event) => setRefundPaymentMethod(event.target.value as PaymentMethod)}
                className="h-8 rounded-lg border border-rose-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="cash">Cash refund</option>
                <option value="bank">Bank refund</option>
                <option value="card">Card refund</option>
                <option value="upi">UPI refund</option>
                <option value="online">Online refund</option>
                <option value="other">Other refund</option>
              </select>
              <button
                type="button"
                onClick={() => { setCancelReason(""); setCancelOpen(true); }}
                className="rounded-full px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"
              >
                Refund {formatMoney(order.advance)} & Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setCancelReason(""); setCancelOpen(true); }}
              className="rounded-full px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"
            >
              Cancel
            </button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Pricing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Price</span><span>{formatMoney(order.price)}</span></div>
            <div className="flex justify-between"><span>Advance</span><span>{formatMoney(order.advance)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance</span><span className={order.balance > 0 ? "text-rose-600" : ""}>{formatMoney(order.balance)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Delivery</span>
              <span>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "—"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Profit (order-specific)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Revenue</span><span>{formatMoney(profit.revenue)}</span></div>
            <div className="flex justify-between"><span>Material cost</span><span>{formatMoney(profit.materialCost)}</span></div>
            <div className="flex justify-between"><span>Order expenses</span><span>{formatMoney(profit.orderSpecificExpenses)}</span></div>
            <div className="flex justify-between font-semibold text-emerald-700">
              <span>Gross profit</span><span>{formatMoney(profit.grossProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {onShareWhatsApp && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Customer WhatsApp updates</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-medium text-slate-600">
                Predesigned customer message
                <select className={inputClass + " mt-1"} aria-label="Customer WhatsApp message template"
                  value={selectedWhatsAppTemplate ?? ""}
                  onChange={(event) => { setWhatsAppTemplate(event.target.value as TemplateId); setWhatsAppError(null); }}>
                  {whatsAppOptions.length === 0 && <option value="">No applicable messages</option>}
                  {whatsAppOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <Button variant="outline" disabled={!selectedWhatsAppTemplate} onClick={shareStatusViaWhatsApp}>Open WhatsApp</Button>
            </div>
            <p className="text-xs text-slate-500">This only opens a prefilled WhatsApp message. Review it and press Send yourself; nothing is sent automatically. For a missing or invalid number, update the customer contact first. Set your official Google review link in Settings to include it automatically in feedback messages.</p>
            {whatsAppError && <p role="alert" className="text-sm text-rose-700">{whatsAppError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Staff allocation</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {staffAssignments.filter((assignment) => assignment.status !== "cancelled").length ? (
            <ul className="space-y-1">
              {staffAssignments.filter((assignment) => assignment.status !== "cancelled").map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{assignment.staffName || assignment.staffId}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{assignment.status.replaceAll("_", " ")} · {new Date(assignment.assignedAt).toLocaleDateString("en-IN")}</span>
                    {canAssignStaff && onStartAssignment && canStartServiceAssignment(assignment, order) && (
                      <Button size="sm" variant="outline" onClick={() => transitionStaffAssignment(assignment, "start")}>Start Work</Button>
                    )}
                    {canAssignStaff && onCompleteAssignment && canCompleteServiceAssignment(assignment, order) && (
                      <Button size="sm" variant="outline" onClick={() => transitionStaffAssignment(assignment, "complete")}>Complete Work</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-500">No staff assigned to this service order.</p>}
          {canAssignToThisOrder && onAssignStaff && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-44 flex-1 text-xs font-medium text-slate-600">
                Assign active staff
                <select aria-label="Assign active service staff" className={inputClass + " mt-1"} value={staffToAssign}
                  onChange={(event) => { setStaffToAssign(event.target.value); setStaffAssignError(null); }}>
                  <option value="">Select staff member</option>
                  {availableStaff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.role})</option>)}
                </select>
              </label>
              <Button variant="outline" disabled={!availableStaff.some((member) => member.id === staffToAssign)}
                onClick={submitStaffAssignment}>Assign Staff</Button>
            </div>
          )}
          {canAssignToThisOrder && availableStaff.length === 0 && <p className="text-xs text-slate-500">No additional active staff available.</p>}
          {staffAssignError && <p role="alert" className="text-sm text-rose-700">{staffAssignError}</p>}
          <p className="text-xs text-slate-500">Staff assignments are recorded in order history and synced for Online / Offline / Hybrid editions.</p>
        </CardContent>
      </Card>

      {(order.status === "qc" || qualityCheck) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-slate-800">Quality Check</CardTitle>
              {qualityCheck && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${qualityCheck.status === "passed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {qualityCheck.status === "passed" ? "PASSED" : "REWORK REQUIRED"}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {qualityCheck && (
              <div className={`rounded-xl border p-3 ${qualityCheck.status === "passed" ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
                <div className="text-xs text-slate-500">Checked {new Date(qualityCheck.checkedAt).toLocaleString("en-IN")}</div>
                {qualityCheck.issues.length > 0 && <div className="mt-2 text-sm"><span className="font-medium">Issues:</span> {qualityCheck.issues.join(" · ")}</div>}
                {qualityCheck.notes && <div className="mt-1 text-sm"><span className="font-medium">Notes:</span> {qualityCheck.notes}</div>}
              </div>
            )}
            {order.status === "qc" && onQualityCheck && (
              <>
                <div className="flex gap-2">
                  <input className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Add QC issue" value={qcIssue} onChange={(event) => setQcIssue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addQcIssue(); } }} />
                  <Button variant="outline" size="sm" onClick={addQcIssue}>Add issue</Button>
                </div>
                {qcIssues.length > 0 && <div className="flex flex-wrap gap-2">{qcIssues.map((issue) => <button key={issue} type="button" onClick={() => setQcIssues((items) => items.filter((item) => item !== issue))} className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">{issue} ×</button>)}</div>}
                <textarea className="h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="QC notes" value={qcNotes} onChange={(event) => setQcNotes(event.target.value)} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => submitQc(false)} disabled={qcIssues.length === 0}>Send for Rework</Button>
                  <Button onClick={() => submitQc(true)}>Pass QC & Continue</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {measurementHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold text-slate-800">Measurement history</CardTitle>
              <span className="text-xs text-slate-400">{selectedProfile?.label} · {measurementHistory.length} revision{measurementHistory.length === 1 ? "" : "s"}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {measurementHistory.map((profile, index) => (
              <div key={profile.id} className={`rounded-xl border p-3 ${index === 0 ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Revision {measurementHistory.length - index}
                    {index === 0 && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">USED BY THIS ORDER</span>}
                  </div>
                  <span className="text-xs text-slate-500">{new Date(profile.recordedAt).toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(profile.fields).map(([key, value]) =>
                    value != null && (
                      <div key={key} className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                        <div className="text-[10px] uppercase text-slate-400">{measurementLabel(key)}</div>
                        <div className="text-sm font-medium text-slate-800">{String(value)}</div>
                      </div>
                    )
                  )}
                </div>
                {profile.notes && <p className="mt-2 text-xs text-slate-500">{profile.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.measurements && Object.keys(order.measurements).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Measurements used on order</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
              {Object.entries(order.measurements).map(([k, v]) =>
                v != null && typeof v !== "object" ? (
                  <div key={k} className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase text-slate-400">{measurementLabel(k)}</div>
                    <div className="font-medium">{String(v)}</div>
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {order.tshirt && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">T-shirt printing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div>Type: {order.tshirt.tshirtType || "—"}</div>
            <div>Size: {order.tshirt.size || "—"}</div>
            <div>Color: {order.tshirt.color || "—"}</div>
            <div>Qty: {order.tshirt.quantity}</div>
            <div>Print: {order.tshirt.printingType || "—"}</div>
            <div>Design: {order.tshirt.designDescription || "—"}</div>
            <div>Print cost: {formatMoney(order.tshirt.printingCost)}</div>
            <div>Customer price: {formatMoney(order.tshirt.customerPrice)}</div>
          </CardContent>
        </Card>
      )}

      {onAddExpense && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-800">Order-specific expense</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {order.expenses.map((e) => (
              <div key={e.id} className="flex justify-between text-sm">
                <span>{e.description}</span>
                <span>{formatMoney(e.amount)}</span>
              </div>
            ))}
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              <select aria-label="Order expense category" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" value={expCategoryId} onChange={(e) => setExpCategoryId(e.target.value)}>
                <option value="">Select category</option>
                {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select aria-label="Order expense payment method" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" value={expPaymentMethod} onChange={(e) => setExpPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
              <input aria-label="Order expense description" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Description" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
              <div className="flex gap-2">
                <input aria-label="Order expense amount" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} />
                <Button size="sm" disabled={!expCategoryId || !(parseFloat(expAmt) > 0)} onClick={() => {
                  const amount = parseFloat(expAmt);
                  if (!expCategoryId || !(amount > 0)) return;
                  onAddExpense({ description: expDesc, amount, categoryId: expCategoryId, paymentMethod: expPaymentMethod });
                  setExpDesc("");
                  setExpAmt("");
                }}>Record Expense</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-800">Order history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {auditHistory.length === 0 && <p className="text-sm text-slate-400">No audit events recorded for this order yet.</p>}
          {auditHistory.map((entry) => {
            const reason = auditReason(entry);
            return (
              <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{auditActionLabel(entry.action)}</span>
                  <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{entry.userName || "System"}</div>
                {reason && <div className="mt-1 text-sm text-slate-600"><span className="font-medium">Reason:</span> {reason}</div>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {order.notes && <p className="text-sm text-slate-600"><span className="font-medium">Notes:</span> {order.notes}</p>}
      <Modal
        open={editOpen}
        title={`Edit / reschedule ${order.orderNumber}`}
        onClose={() => setEditOpen(false)}
        footer={<>
          <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button disabled={editReason.trim().length < 3} onClick={saveOperationalEdit}>Save operational changes</Button>
        </>}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            Customer, service type and financial values are locked after creation because this order is already linked to receivables/accounting. Operational details can still be corrected safely.
          </div>
          <FormField label="Delivery date">
            <input type="date" className={inputClass} value={editDeliveryDate} onChange={(e) => setEditDeliveryDate(e.target.value)} />
          </FormField>
          <FormField label="Material details">
            <textarea className={inputClass + " h-20 py-2"} value={editMaterialDetails} onChange={(e) => setEditMaterialDetails(e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClass + " h-20 py-2"} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </FormField>
          <FormField label="Change reason *">
            <textarea className={inputClass + " h-20 py-2"} value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Why is this order being changed?" />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        title={`Cancel ${order.orderNumber}`}
        onClose={() => { setCancelOpen(false); setCancelReason(""); }}
        footer={<>
          <Button variant="outline" onClick={() => { setCancelOpen(false); setCancelReason(""); }}>Keep order</Button>
          <Button
            disabled={cancelReason.trim().length < 3}
            onClick={() => {
              onStatusChange?.("cancelled", {
                refundPaymentMethod: order.advance > 0 ? refundPaymentMethod : undefined,
                reason: cancelReason.trim(),
              });
              setCancelOpen(false);
              setCancelReason("");
            }}
          >
            {order.advance > 0 ? `Refund ${formatMoney(order.advance)} & cancel` : "Confirm cancellation"}
          </Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Cancellation reverses the service-order accounting and customer balances. A reason is mandatory and the event remains in the audit trail.
          </p>
          {order.advance > 0 && (
            <FormField label="Refund method">
              <select className={inputClass} value={refundPaymentMethod} onChange={(e) => setRefundPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </FormField>
          )}
          <FormField label="Cancellation reason *">
            <textarea className={inputClass + " h-20 py-2"} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this order being cancelled?" />
          </FormField>
        </div>
      </Modal>

      {printNotice && (
        <div
          role={printNotice.state === "error" ? "alert" : "status"}
          aria-live={printNotice.state === "error" ? "assertive" : "polite"}
          className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${printNotice.state === "error" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-800"}`}
        >
          <p>{printNotice.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setPrintPreviewPaper("a4"); setPrintNotice(null); }}>Retry A4</Button>
            <Button size="sm" variant="outline" onClick={() => { setPrintPreviewPaper("thermal"); setPrintNotice(null); }}>Retry Thermal</Button>
          </div>
        </div>
      )}
      {printPreviewPaper && (
        <PrintPreviewModal
          open
          title={`Service invoice ${order.orderNumber}`}
          html={buildOrderInvoiceHtml(order, { paper: printPreviewPaper, autoPrint: false })}
          paper={printPreviewPaper}
          onClose={() => setPrintPreviewPaper(null)}
          onPrint={() => printServiceInvoice(printPreviewPaper)}
        />
      )}
    </div>
  );
}
