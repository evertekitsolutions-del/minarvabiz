"use client";

import * as React from "react";
import type { Quotation, QuotationLine, QuotationStatus } from "@minarvabiz/types";
import {
  archiveQuotation,
  buildQuotationHtml,
  canArchiveQuotation,
  canEditQuotation,
  canSetQuotationStatus,
  convertQuotationToOrder,
  convertQuotationToSale,
  createQuotation,
  listQuotations,
  printQuotation,
  setQuotationStatus,
  store,
  updateQuotation,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { Modal } from "../forms/Modal";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

type EditableLine = {
  kind: QuotationLine["kind"];
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

type EditForm = {
  quotation: Quotation;
  customerId: string;
  lines: EditableLine[];
  materialCharges: number;
  labourCharges: number;
  discount: number;
  tax: number;
  advance: number;
  validUntil: string;
  notes: string;
};

const statuses: QuotationStatus[] = ["draft", "sent", "accepted", "rejected", "expired", "converted"];

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

export function QuotationsPanel() {
  const [list, setList] = React.useState(() => listQuotations());
  const [customerId, setCustomerId] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [price, setPrice] = React.useState(0);
  const [validUntil, setValidUntil] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ quotation: Quotation; paper: "a4" | "thermal" } | null>(null);

  const [query, setQuery] = React.useState("");
  const [filterCustomer, setFilterCustomer] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const [editForm, setEditForm] = React.useState<EditForm | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Quotation | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");

  const customers = store.listCustomers();
  const products = store.listProducts();

  const refresh = React.useCallback(() => setList(listQuotations()), []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((quotation) => {
      if (filterCustomer && quotation.customerId !== filterCustomer) return false;
      if (filterStatus && quotation.status !== filterStatus) return false;
      const created = dateKey(quotation.createdAt);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      if (!q) return true;
      return [
        quotation.quotationNumber,
        quotation.customerName || "",
        quotation.notes || "",
        ...quotation.lines.flatMap((line) => [line.description, line.productId || ""]),
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [list, filterCustomer, filterStatus, dateFrom, dateTo, query]);

  function create() {
    if (!customerId || !desc.trim()) {
      setMsg("Select a customer and enter a description.");
      return;
    }
    const result = createQuotation({
      customerId,
      lines: [{ kind: "service", description: desc.trim(), quantity: qty, unitPrice: price }],
      validUntil: validUntil || null,
      notes: notes.trim() || null,
    });
    setMsg(result.errors.length ? result.errors.join(", ") : `Created ${result.quotation?.quotationNumber}`);
    if (!result.errors.length) {
      setDesc("");
      setQty(1);
      setPrice(0);
      setValidUntil("");
      setNotes("");
    }
    refresh();
  }

  function openEditor(q: Quotation) {
    if (!canEditQuotation(q)) {
      setMsg("Only draft or sent quotations can be edited.");
      return;
    }
    setEditForm({
      quotation: q,
      customerId: q.customerId,
      lines: q.lines.map((line) => ({
        kind: line.kind,
        productId: line.productId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      materialCharges: q.materialCharges,
      labourCharges: q.labourCharges,
      discount: q.discount,
      tax: q.tax,
      advance: q.advance,
      validUntil: q.validUntil ? dateKey(q.validUntil) : "",
      notes: q.notes || "",
    });
  }

  function saveEdit() {
    if (!editForm) return;
    const result = updateQuotation(editForm.quotation.id, {
      customerId: editForm.customerId,
      lines: editForm.lines,
      materialCharges: editForm.materialCharges,
      labourCharges: editForm.labourCharges,
      discount: editForm.discount,
      tax: editForm.tax,
      advance: editForm.advance,
      validUntil: editForm.validUntil || null,
      notes: editForm.notes || null,
    });
    if (result.errors.length) {
      setMsg(result.errors.join("; "));
      return;
    }
    setMsg(`Updated ${result.quotation?.quotationNumber}`);
    setEditForm(null);
    refresh();
  }

  function archiveSelected() {
    if (!archiveTarget) return;
    const result = archiveQuotation(archiveTarget.id, archiveReason);
    if (result.error) {
      setMsg(result.error);
      return;
    }
    setMsg(`Archived ${archiveTarget.quotationNumber}`);
    setArchiveTarget(null);
    setArchiveReason("");
    refresh();
  }

  const clearFilters = () => {
    setQuery("");
    setFilterCustomer("");
    setFilterStatus("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Quotations / Estimates</h2>
        <p className="text-sm text-slate-500">Create, filter, edit eligible quotations, preview, print and convert without breaking document history.</p>
      </div>
      {msg && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</p>}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer">
            <select className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Description">
            <input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </FormField>
          <FormField label="Qty">
            <input className={inputClass} type="number" min="1" step="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </FormField>
          <FormField label="Unit price">
            <input className={inputClass} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
          </FormField>
          <FormField label="Valid until">
            <input className={inputClass} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </FormField>
          <FormField label="Notes" className="sm:col-span-2">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <div className="flex items-end">
            <Button onClick={create}>Create quotation</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Search quotation, customer or item
          <input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Customer
          <select className={selectClass + " mt-1"} value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Status
          <select className={selectClass + " mt-1"} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-600">
            From
            <input className={inputClass + " mt-1"} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input className={inputClass + " mt-1"} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-5 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{filtered.length} of {list.length} quotations</p>
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{q.quotationNumber} · {q.customerName}</div>
                <div className="text-slate-500">
                  {new Date(q.createdAt).toLocaleDateString("en-IN")} · {q.status} · Total {q.total.toFixed(2)} · Balance {q.balance.toFixed(2)}
                </div>
                {q.validUntil && <div className="mt-0.5 text-xs text-slate-400">Valid until {new Date(q.validUntil + (q.validUntil.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-IN")}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={selectClass}
                  value={q.status}
                  disabled={q.status === "converted"}
                  onChange={(e) => {
                    const result = setQuotationStatus(q.id, e.target.value as QuotationStatus);
                    setMsg(result.error || `Status updated to ${e.target.value}`);
                    refresh();
                  }}
                >
                  {statuses.map((status) => <option key={status} value={status} disabled={!canSetQuotationStatus(q, status)}>{status}</option>)}
                </select>
                {canEditQuotation(q) && <Button size="sm" variant="outline" onClick={() => openEditor(q)}>Edit</Button>}
                <Button size="sm" variant="outline" onClick={() => setPreview({ quotation: q, paper: "a4" })}>A4 Preview</Button>
                <Button size="sm" variant="outline" onClick={() => setPreview({ quotation: q, paper: "thermal" })}>Thermal Preview</Button>
                {q.status !== "converted" && <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToSale(q.id); setMsg(result.error || `Sale ${result.saleId}`); refresh(); }}>→ Sale</Button>}
                {q.status !== "converted" && <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToOrder(q.id); setMsg(result.error || `Order ${result.orderId}`); refresh(); }}>→ Order</Button>}
                {canArchiveQuotation(q) && <Button size="sm" variant="outline" onClick={() => { setArchiveReason(""); setArchiveTarget(q); }}>Archive</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {!filtered.length && <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">No quotations match the selected filters</p>}
      </div>

      <Modal
        open={Boolean(editForm)}
        title={editForm ? `Edit ${editForm.quotation.quotationNumber}` : "Edit quotation"}
        onClose={() => setEditForm(null)}
        footer={<><Button variant="outline" onClick={() => setEditForm(null)}>Cancel</Button><Button onClick={saveEdit}>Save changes</Button></>}
      >
        {editForm && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Only draft or sent quotations are editable. Converted quotations remain immutable to preserve document linkage.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Customer">
                <select className={selectClass} value={editForm.customerId} onChange={(e) => setEditForm({ ...editForm, customerId: e.target.value })}>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </FormField>
              <FormField label="Valid until">
                <input className={inputClass} type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} />
              </FormField>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Quotation lines</h3>
                <Button size="sm" variant="outline" onClick={() => setEditForm({
                  ...editForm,
                  lines: [...editForm.lines, { kind: "service", productId: null, description: "", quantity: 1, unitPrice: 0 }],
                })}>Add line</Button>
              </div>
              {editForm.lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
                  <select
                    className={selectClass + " sm:col-span-2"}
                    value={line.kind}
                    onChange={(e) => {
                      const lines = [...editForm.lines];
                      lines[index] = { ...line, kind: e.target.value as QuotationLine["kind"], productId: null };
                      setEditForm({ ...editForm, lines });
                    }}
                  >
                    {["product", "service", "material", "labour"].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                  {line.kind === "product" ? (
                    <select
                      className={selectClass + " sm:col-span-3"}
                      value={line.productId || ""}
                      onChange={(e) => {
                        const product = products.find((p) => p.id === e.target.value);
                        const lines = [...editForm.lines];
                        lines[index] = { ...line, productId: e.target.value || null, description: product?.name || line.description, unitPrice: product?.sellingPrice ?? line.unitPrice };
                        setEditForm({ ...editForm, lines });
                      }}
                    >
                      <option value="">Select product</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  ) : <div className="hidden sm:block sm:col-span-3" />}
                  <input
                    className={inputClass + " sm:col-span-3"}
                    value={line.description}
                    placeholder="Description"
                    onChange={(e) => {
                      const lines = [...editForm.lines];
                      lines[index] = { ...line, description: e.target.value };
                      setEditForm({ ...editForm, lines });
                    }}
                  />
                  <input
                    className={inputClass + " sm:col-span-1"}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => {
                      const lines = [...editForm.lines];
                      lines[index] = { ...line, quantity: Math.max(0.01, Number(e.target.value) || 0.01) };
                      setEditForm({ ...editForm, lines });
                    }}
                  />
                  <input
                    className={inputClass + " sm:col-span-2"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => {
                      const lines = [...editForm.lines];
                      lines[index] = { ...line, unitPrice: Math.max(0, Number(e.target.value) || 0) };
                      setEditForm({ ...editForm, lines });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={editForm.lines.length === 1}
                    onClick={() => setEditForm({ ...editForm, lines: editForm.lines.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {([
                ["Material charges", "materialCharges"],
                ["Labour charges", "labourCharges"],
                ["Discount", "discount"],
                ["Tax", "tax"],
                ["Advance", "advance"],
              ] as const).map(([label, key]) => (
                <FormField key={key} label={label}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </FormField>
              ))}
            </div>
            <FormField label="Notes">
              <textarea className={inputClass + " h-20 py-2"} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </FormField>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(archiveTarget)}
        title={archiveTarget ? `Archive ${archiveTarget.quotationNumber}` : "Archive quotation"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); }}
        footer={<>
          <Button variant="outline" onClick={() => { setArchiveTarget(null); setArchiveReason(""); }}>Cancel</Button>
          <Button onClick={archiveSelected}>Archive quotation</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This is a soft archive, not a destructive database delete. Converted and accepted quotations cannot be archived.</p>
          <FormField label="Reason *">
            <textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Why is this quotation being archived?" />
          </FormField>
        </div>
      </Modal>

      {preview && (
        <PrintPreviewModal
          open
          title={`Quotation ${preview.quotation.quotationNumber}`}
          html={buildQuotationHtml(preview.quotation, { paper: preview.paper, autoPrint: false })}
          paper={preview.paper}
          onPaperChange={(paper) => setPreview({ ...preview, paper })}
          onClose={() => setPreview(null)}
          onPrint={() => printQuotation(preview.quotation, preview.paper)}
        />
      )}
    </div>
  );
}
