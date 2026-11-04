"use client";

import * as React from "react";
import type { AuditLogEntry, Customer, LaundryOrder } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { LaundryIncidentsPanel } from "./LaundryIncidentsPanel";
import { LaundryOperationsPanel } from "./LaundryOperationsPanel";
import { LaundryWhatsAppPanel } from "./LaundryWhatsAppPanel";
import { LaundryRoutePanel } from "./LaundryRoutePanel";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { buildLaundryVendorScorecard, exportLaundryTicketsCsv } from "@minarvabiz/business-logic";

type LaundryEditResult = { success: boolean; error?: string; order?: LaundryOrder };

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

function actionLabel(action: string) {
  return action.replace(/^laundry\./, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CODE39: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn",
  "4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw",
  "8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw",
  "C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn",
  "G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww",
  "O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnnww","R":"wnnnnnnwn",
  "S":"nnwnnnnwn","T":"nnnnwnnwn","U":"wwnnnnnnw","V":"nwwnnnnnw",
  "W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn",
  "-":"nwnnnnwnw",".":"wwnnnwnnn"," ":"nwwnnnwnn","$":"nwnwnwnnn",
  "/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn",
};
function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]!));
}
function code39Svg(value: string) {
  const encoded = "*" + value.toUpperCase() + "*";
  if ([...encoded].some((char) => !CODE39[char])) return "";
  const unit = 2;
  let x = 8;
  const bars: string[] = [];
  [...encoded].forEach((char, charIndex) => {
    [...CODE39[char]].forEach((width, index) => {
      const size = width === "w" ? unit * 3 : unit;
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${size}" height="42" />`);
      x += size;
    });
    if (charIndex < encoded.length - 1) x += unit;
  });
  return `<svg class="barcode" viewBox="0 0 ${x + 8} 42" role="img" aria-label="Code 39 barcode for ${escapePrintHtml(value)}">${bars.join("")}</svg>`;
}

export function LaundryList({
  orders,
  customers = [],
  auditLogs = [],
  onAddOutsourced,
  onAddIroning,
  onCreate,
  onSearch,
  onSelect,
  onStatusChange,
  onCancel,
  onUpdateDetails,
}: {
  orders: LaundryOrder[];
  customers?: Pick<Customer,"id" | "name" | "phone" | "whatsapp" | "address" | "branchId">[];
  auditLogs?: AuditLogEntry[];
  onAddOutsourced?: () => void;
  onAddIroning?: () => void;
  onCreate?: (mode: "outsourced" | "in_house_ironing") => void;
  onSearch?: (q: string) => void;
  onSelect?: (o: LaundryOrder) => void;
  onStatusChange?: (order: LaundryOrder, status: LaundryOrder["status"]) => void;
  onCancel?: (order: LaundryOrder) => void;
  onUpdateDetails?: (order: LaundryOrder, values: { garment: string; notes: string }) => LaundryEditResult;
}) {
  const [q, setQ] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [mode, setMode] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [detailTarget, setDetailTarget] = React.useState<LaundryOrder | null>(null);
  const [messageTarget, setMessageTarget] = React.useState<LaundryOrder | null>(null);
  const [editTarget, setEditTarget] = React.useState<LaundryOrder | null>(null);
  const [editGarment, setEditGarment] = React.useState("");
  const [editNotes, setEditNotes] = React.useState("");
  const [editPickupAt, setEditPickupAt] = React.useState("");
  const [editDueAt, setEditDueAt] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);
  const [csvFeedback, setCsvFeedback] = React.useState<{ failed: boolean; message: string } | null>(null);
  const [tagPrintFeedback, setTagPrintFeedback] = React.useState<string | null>(null);

  const customerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => { if (order.customerId) map.set(order.customerId, order.customerName || order.customerId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const supplierOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => { if (order.supplierId) map.set(order.supplierId, order.supplierName || order.supplierId); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter((order) => {
      if (customerId && order.customerId !== customerId) return false;
      if (mode && order.mode !== mode) return false;
      if (status && order.status !== status) return false;
      if (supplierId === "__none" && order.supplierId) return false;
      if (supplierId && supplierId !== "__none" && order.supplierId !== supplierId) return false;
      const created = dateKey(order.createdAt);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      if (!query) return true;
      return [
        order.orderNumber,
        order.customerName || "",
        order.garment || "",
        order.supplierName || "",
        order.notes || "",
        ...(order.items || []).map((item) => item.tagCode),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [orders, q, customerId, mode, status, supplierId, dateFrom, dateTo]);

  const clearFilters = () => {
    setQ("");
    setCustomerId("");
    setMode("");
    setStatus("");
    setSupplierId("");
    setDateFrom("");
    setDateTo("");
    onSearch?.("");
  };

  const openDetails = (order: LaundryOrder) => {
    setDetailTarget(order);
    onSelect?.(order);
  };

  const openEdit = (order: LaundryOrder) => {
    setEditTarget(order);
    setEditGarment(order.garment || "");
    setEditNotes(order.notes || "");
    setEditPickupAt(order.pickupAt?.slice(0, 10) || "");
    setEditDueAt(order.dueAt?.slice(0, 10) || "");
    setEditError(null);
  };

  const saveItemWorkflow = (itemId: string, patch: { processingStatus?: string; qualityStatus?: string }) => {
    if (!detailTarget || !onUpdateDetails || !detailTarget.items) return;
    const items = detailTarget.items.map((item) => item.id === itemId ? { ...item, ...patch } : { ...item });
    const result = onUpdateDetails(detailTarget, {
      garment: detailTarget.garment || "",
      notes: detailTarget.notes || "",
      items,
      pickupAt: detailTarget.pickupAt ?? null,
      dueAt: detailTarget.dueAt ?? null,
    } as { garment: string; notes: string });
    if (!result.success) {
      setEditError(result.error || "Unable to update item workflow");
      return;
    }
    setEditError(null);
    if (result.order) setDetailTarget(result.order);
  };

  const saveEdit = () => {
    if (!editTarget || !onUpdateDetails) return;
    const result = onUpdateDetails(editTarget, { garment: editGarment, notes: editNotes, pickupAt: editPickupAt || null, dueAt: editDueAt || null } as { garment: string; notes: string });
    if (!result.success) {
      setEditError(result.error || "Unable to update laundry ticket");
      return;
    }
    if (result.order) setDetailTarget(result.order);
    setEditTarget(null);
    setEditError(null);
  };

  function printGarmentTags(order: LaundryOrder) {
    const items = order.items || [];
    if (!items.length) {
      setTagPrintFeedback("This legacy ticket has no itemized garment tags to print.");
      return;
    }
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      setTagPrintFeedback("Print window was blocked. Allow pop-ups and try again.");
      return;
    }
    const labels = items.map((item) => `
      <article class="tag">
        <div class="brand">MINARVA BIZ · LAUNDRY</div>
        <div class="ticket">${escapePrintHtml(order.orderNumber)}</div>
        <div class="garment">${escapePrintHtml(item.label)} × ${escapePrintHtml(String(item.quantity))}</div>
        ${code39Svg(item.tagCode)}
        <div class="code">${escapePrintHtml(item.tagCode)}</div>
        <div class="customer">${escapePrintHtml(order.customerName || "Customer")}</div>
        <div class="due">${order.dueAt ? "Due: " + escapePrintHtml(order.dueAt.slice(0, 10)) : ""}</div>
      </article>`).join("");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Garment tags — ${escapePrintHtml(order.orderNumber)}</title>
      <style>
        @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;margin:0;color:#111}
        .sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}
        .tag{height:48mm;border:1px dashed #777;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid}
        .brand{font-size:8px;letter-spacing:.7px;font-weight:bold}.ticket{font-size:10px;margin-top:2mm}
        .garment{font-size:13px;font-weight:bold;margin-top:1mm;text-align:center}
        .barcode{width:100%;max-height:14mm;margin-top:2mm;fill:#000}
        .code{font:bold 10px monospace;letter-spacing:1px;margin-top:1mm}
        .customer,.due{font-size:8px;margin-top:1mm}
        @media screen{body{padding:12px;background:#eee}.sheet{max-width:190mm;margin:auto}.tag{background:white}}
      </style></head><body><main class="sheet">${labels}</main>
      <script>window.addEventListener("load",()=>{window.focus();window.print();});</script></body></html>`);
    popup.document.close();
    setTagPrintFeedback(`Print dialog opened for ${items.length} garment tag(s). Verify barcode readability with your scanner after printing.`);
  }

  function downloadFilteredTickets() {
    if (!filtered.length) return;
    try {
      const csv = exportLaundryTicketsCsv(filtered);
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "minarvabiz-laundry-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(anchor);
      try {
        anchor.click();
        setCsvFeedback({ failed: false, message: "Export requested for " + filtered.length + " displayed laundry ticket(s)." });
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setCsvFeedback({ failed: true, message: error instanceof Error ? error.message : "Laundry CSV export failed." });
    }
  }

  const columns: Column<LaundryOrder>[] = [
    { key: "orderNumber", header: "Order", render: (r) => <span className="font-medium">{r.orderNumber}</span> },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || "—" },
    { key: "mode", header: "Mode", render: (r) => <span className={r.mode === "outsourced" ? "text-violet-700" : "text-cyan-700"}>{r.mode === "outsourced" ? "Outsourced" : "In-house ironing"}</span> },
    { key: "garment", header: "Garment", render: (r) => r.garment || "—" },
    { key: "quantity", header: "Qty" },
    { key: "totalCustomerCharge", header: "Customer", render: (r) => formatMoney(r.totalCustomerCharge) },
    { key: "profit", header: "Profit", render: (r) => <span className="font-medium text-emerald-600">{formatMoney(r.profit)}</span> },
    { key: "status", header: "Status", render: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{r.status.replaceAll("_", " ")}</span> },
    {
      key: "action",
      header: "Actions",
      render: (r) => {
        const allItemsPassedQc = !r.items?.length || r.items.every(item => item.processingStatus === "delivered" && item.qualityStatus === "passed");
        const next = r.mode === "outsourced" && r.status !== "cancelled"
          ? (r.status === "pending" ? "sent" : r.status === "sent" ? "received" : r.status === "received" && allItemsPassedQc ? "delivered" : null)
          : !r.items?.length && r.mode === "in_house_ironing"
            ? (r.status === "pending" ? "received" : r.status === "received" ? "delivered" : null)
            : null;
        const label = next === "sent" ? "Mark Sent" : next === "received" ? "Mark Received" : next === "delivered" ? "Mark Delivered" : null;
        return (
          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" onClick={() => openDetails(r)}>Details</Button>
            <Button size="sm" variant="outline" onClick={() => setMessageTarget(r)}>WhatsApp</Button>
            {r.status !== "cancelled" && onUpdateDetails && <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit Details</Button>}
            {r.mode === "outsourced" && r.status === "received" && !allItemsPassedQc && <span className="self-center text-xs text-amber-700">Finish garment QC in Details before delivery</span>}
            {label && onStatusChange && <Button size="sm" variant="outline" onClick={() => onStatusChange(r, next!)}>{label}</Button>}
            {r.status !== "cancelled" && onCancel && <Button size="sm" variant="danger" onClick={() => onCancel(r)}>Cancel Ticket</Button>}
          </div>
        );
      },
    },
  ];

  const ironing = onAddIroning ?? (() => onCreate?.("in_house_ironing"));
  const outsourced = onAddOutsourced ?? (() => onCreate?.("outsourced"));
  const detailHistory = detailTarget
    ? auditLogs.filter((entry) => entry.tableName === "laundry_orders" && entry.recordId === detailTarget.id)
    : [];
  const vendorScores = React.useMemo(() => {
    const now = new Date();
    const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    return buildLaundryVendorScorecard(orders, day);
  }, [orders]);

  return (
    <>
      <LaundryWhatsAppPanel order={messageTarget} customer={customers.find(c => c.id === messageTarget?.customerId) || null} onClose={() => setMessageTarget(null)} />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Laundry & Ironing</h2>
            <p className="text-sm text-slate-500">{filtered.length} of {orders.length} tickets</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={filtered.length === 0} onClick={downloadFilteredTickets}>Export filtered CSV</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
            <Button variant="outline" onClick={ironing}>+ In-house Ironing</Button>
            <Button onClick={outsourced}>+ Outsourced Laundry</Button>
          </div>
        </div>

        <LaundryRoutePanel orders={orders} customers={customers} />
        <LaundryOperationsPanel orders={orders} />
        <LaundryIncidentsPanel orders={orders} />
        {csvFeedback && <p role={csvFeedback.failed ? "alert" : "status"} className={`text-sm ${csvFeedback.failed ? "text-rose-700" : "text-slate-600"}`}>{csvFeedback.message}</p>}
        {tagPrintFeedback && <p role="status" className="text-sm text-slate-600">{tagPrintFeedback}</p>}
        <p className="text-xs text-slate-500">CSV includes displayed cancelled tickets for traceability. Use Reports for reconciled financial totals.</p>
        {vendorScores.length > 0 && <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3" aria-label="Laundry vendor comparison">
          <h3 className="text-sm font-semibold text-slate-900">Laundry supplier performance · In-house comparison</h3>
          <p className="mb-2 mt-1 text-xs text-slate-500">Contribution excludes in-house wages, utilities and other overheads. Late counts only open tickets with a recorded due date.</p>
          <table className="w-full min-w-[740px] text-left text-xs">
            <thead><tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2 pr-3">Supplier / mode</th><th className="py-2 pr-3">Tickets</th><th className="py-2 pr-3">Garments</th><th className="py-2 pr-3">Delivered</th><th className="py-2 pr-3">Overdue</th><th className="py-2 pr-3">QC issues</th><th className="py-2 pr-3">Vendor cost</th><th className="py-2">Contribution</th>
            </tr></thead>
            <tbody>{vendorScores.map(score => <tr key={score.mode + ":" + (score.supplierId || "local")} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-3 font-medium">{score.supplierName}</td>
              <td className="py-2 pr-3">{score.orders}</td><td className="py-2 pr-3">{score.garments}</td><td className="py-2 pr-3">{score.delivered}</td><td className="py-2 pr-3">{score.overdueOpen}</td><td className="py-2 pr-3">{score.qcFailedItems}</td>
              <td className="py-2 pr-3">{formatMoney(score.supplierCost)}</td><td className="py-2 font-medium">{formatMoney(score.contributionBeforeInternalCosts)}</td>
            </tr>)}</tbody>
          </table>
        </section>}
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-7">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search ticket, customer, garment or supplier
            <input
              type="search"
              placeholder="Search…"
              value={q}
              onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
              className={inputClass + " mt-1"}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Customer
            <select className={selectClass + " mt-1"} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">All customers</option>
              {customerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Mode
            <select className={selectClass + " mt-1"} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">All modes</option>
              <option value="outsourced">Outsourced</option>
              <option value="in_house_ironing">In-house ironing</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select className={selectClass + " mt-1"} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {["pending", "sent", "received", "delivered", "cancelled"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Supplier
            <select className={selectClass + " mt-1"} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">All suppliers</option>
              <option value="__none">No supplier / in-house</option>
              {supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>

        <DataTable columns={columns} rows={filtered} onRowClick={openDetails} emptyMessage="No laundry tickets match the selected filters" />
      </div>

      <Modal
        open={Boolean(detailTarget)}
        title={detailTarget ? `Laundry ticket ${detailTarget.orderNumber}` : "Laundry ticket details"}
        onClose={() => setDetailTarget(null)}
        className="max-w-3xl"
        footer={detailTarget ? <>
          <Button variant="outline" onClick={() => setDetailTarget(null)}>Close</Button>
          {detailTarget.status !== "cancelled" && onUpdateDetails && <Button variant="outline" onClick={() => openEdit(detailTarget)}>Edit Details</Button>}
          {detailTarget.status !== "cancelled" && onCancel && <Button variant="danger" onClick={() => { onCancel(detailTarget); setDetailTarget(null); }}>Cancel Ticket</Button>}
        </> : undefined}
      >
        {detailTarget && (
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">
              Financial values are posted at ticket creation and stay immutable. Use cancellation/refund for accounting-safe financial corrections.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs text-slate-500">Customer</div><div className="font-medium text-slate-900">{detailTarget.customerName || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Mode</div><div className="font-medium text-slate-900">{detailTarget.mode === "outsourced" ? "Outsourced" : "In-house ironing"}</div></div>
              <div><div className="text-xs text-slate-500">Status</div><div className="font-medium capitalize text-slate-900">{detailTarget.status.replaceAll("_", " ")}</div></div>
              <div><div className="text-xs text-slate-500">Created</div><div className="font-medium text-slate-900">{new Date(detailTarget.createdAt).toLocaleString("en-IN")}</div></div>
              <div><div className="text-xs text-slate-500">Garment</div><div className="font-medium text-slate-900">{detailTarget.garment || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Quantity</div><div className="font-medium text-slate-900">{detailTarget.quantity}</div></div>
              <div><div className="text-xs text-slate-500">Supplier</div><div className="font-medium text-slate-900">{detailTarget.supplierName || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Last updated</div><div className="font-medium text-slate-900">{new Date(detailTarget.updatedAt).toLocaleString("en-IN")}</div></div>
              <div><div className="text-xs text-slate-500">Pickup date</div><div className="font-medium text-slate-900">{detailTarget.pickupAt ? new Date(detailTarget.pickupAt).toLocaleDateString("en-IN") : "—"}</div></div>
              <div><div className="text-xs text-slate-500">Due / delivery date</div><div className="font-medium text-slate-900">{detailTarget.dueAt ? new Date(detailTarget.dueAt).toLocaleDateString("en-IN") : "—"}</div></div>
            </div>
            {detailTarget.items?.length ? <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Garment tracking & quality control</h3>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Print one Code 39 label per garment item.</p><Button size="sm" variant="outline" onClick={() => printGarmentTags(detailTarget)}>Print garment tags</Button></div>
              {detailTarget.items.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_130px_150px] sm:items-center">
                <div><div className="font-medium text-slate-900">{item.label} × {item.quantity}</div><div className="font-mono text-xs text-slate-500">Tag: {item.tagCode}</div><div className="text-xs text-slate-500">QC: {item.qualityStatus}</div>{item.serviceCode && <div className="text-xs text-slate-500">Service: {item.serviceCode.replaceAll("_", " ")} · Fabric: {item.fabricType || "regular"}{item.tatHours ? ` · TAT: ${item.tatHours}h` : ""}</div>}</div>
                <div className="text-sm capitalize text-slate-700">{item.processingStatus.replaceAll("_", " ")}</div>
                {onUpdateDetails && detailTarget.status !== "cancelled" ? <div className="flex flex-col gap-1">
                  <select aria-label={`Workflow for ${item.tagCode}`} className={selectClass} value={item.processingStatus} onChange={(e) => saveItemWorkflow(item.id, { processingStatus: e.target.value })}>
                    <option value={item.processingStatus}>{item.processingStatus.replaceAll("_", " ")}</option>
                    {item.processingStatus === "received" && <option value="washing">Washing</option>}
                    {item.processingStatus === "washing" && <option value="ironing">Ironing</option>}
                    {item.processingStatus === "ironing" && <option value="quality_check">Quality check</option>}
                    {item.processingStatus === "quality_check" && item.qualityStatus === "failed" && <option value="ironing">Return to ironing</option>}
                    {item.processingStatus === "quality_check" && item.qualityStatus === "passed" && <option value="ready">Ready</option>}
                    {item.processingStatus === "ready" && <option value="delivered">Delivered</option>}
                  </select>
                  {item.processingStatus === "quality_check" && <select aria-label={`Quality result for ${item.tagCode}`} className={selectClass} value={item.qualityStatus} onChange={(e) => saveItemWorkflow(item.id, { qualityStatus: e.target.value })}>
                    <option value="pending">QC pending</option><option value="passed">QC passed</option><option value="failed">QC failed</option>
                  </select>}
                </div> : <span className="text-xs text-slate-500">Read only</span>}
              </div>)}
              {editError && <p role="alert" className="text-sm text-rose-600">{editError}</p>}
            </section> : null}
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <div><div className="text-xs text-slate-500">Customer rate</div><div className="font-semibold">{formatMoney(detailTarget.customerRate)}</div></div>
              <div><div className="text-xs text-slate-500">Supplier rate</div><div className="font-semibold">{formatMoney(detailTarget.supplierRate)}</div></div>
              <div><div className="text-xs text-slate-500">Paid</div><div className="font-semibold">{formatMoney(detailTarget.paidAmount)}</div></div>
              <div><div className="text-xs text-slate-500">Balance</div><div className="font-semibold">{formatMoney(detailTarget.balanceAmount)}</div></div>
              <div><div className="text-xs text-slate-500">Profit</div><div className="font-semibold text-emerald-700">{formatMoney(detailTarget.profit)}</div></div>
            </div>
            {detailTarget.notes && <div><div className="text-xs text-slate-500">Notes</div><div className="mt-1 whitespace-pre-wrap text-slate-700">{detailTarget.notes}</div></div>}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ticket history</h3>
              <div className="space-y-2">
                {detailHistory.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-400">No audit events available for this ticket yet.</div>}
                {detailHistory.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div><span className="font-medium text-slate-800">{actionLabel(entry.action)}</span><span className="ml-2 text-xs text-slate-500">by {entry.userName || "System"}</span></div>
                    <div className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title={editTarget ? `Edit details — ${editTarget.orderNumber}` : "Edit laundry details"}
        onClose={() => { setEditTarget(null); setEditError(null); }}
        footer={<>
          <Button variant="outline" onClick={() => { setEditTarget(null); setEditError(null); }}>Cancel</Button>
          <Button onClick={saveEdit}>Save Details</Button>
        </>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Only non-financial ticket details can be edited. Quantity, rates, supplier cost, payments and balances remain immutable after posting.
          </div>
          <FormField label="Garment / item">
            <input className={inputClass} value={editGarment} onChange={(e) => setEditGarment(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pickup date"><input type="date" className={inputClass} value={editPickupAt} onChange={(e) => setEditPickupAt(e.target.value)} /></FormField>
            <FormField label="Due / delivery date"><input type="date" min={editPickupAt || undefined} className={inputClass} value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)} /></FormField>
          </div>
          <FormField label="Notes">
            <textarea className={inputClass + " h-24 py-2"} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </FormField>
          {editError && <p role="alert" className="text-sm text-rose-600">{editError}</p>}
        </div>
      </Modal>
    </>
  );
}
