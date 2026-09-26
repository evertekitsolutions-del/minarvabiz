"use client";

import * as React from "react";
import type { Quotation, QuotationStatus } from "@minarvabiz/types";
import {
  buildQuotationHtml,
  convertQuotationToOrder,
  convertQuotationToSale,
  createQuotation,
  listQuotations,
  printQuotation,
  setQuotationStatus,
  store,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { PrintPreviewModal } from "../printing/PrintPreviewModal";

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
  const customers = store.listCustomers();

  const refresh = () => setList(listQuotations());

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Quotations / Estimates</h2>
        <p className="text-sm text-slate-500">Create, preview, print and convert customer quotations.</p>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}

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

      <div className="space-y-2">
        {list.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-medium text-slate-900">{q.quotationNumber} · {q.customerName}</div>
                <div className="text-slate-500">{q.status} · Total {q.total.toFixed(2)} · Balance {q.balance.toFixed(2)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className={selectClass}
                  value={q.status}
                  onChange={(e) => { setQuotationStatus(q.id, e.target.value as QuotationStatus); refresh(); }}
                >
                  {["draft", "sent", "accepted", "rejected", "expired", "converted"].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => setPreview({ quotation: q, paper: "a4" })}>A4 Preview</Button>
                <Button size="sm" variant="outline" onClick={() => setPreview({ quotation: q, paper: "thermal" })}>Thermal Preview</Button>
                <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToSale(q.id); setMsg(result.error || `Sale ${result.saleId}`); refresh(); }}>→ Sale</Button>
                <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToOrder(q.id); setMsg(result.error || `Order ${result.orderId}`); refresh(); }}>→ Order</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!list.length && <p className="text-sm text-slate-400">No quotations yet</p>}
      </div>

      {preview && (
        <PrintPreviewModal
          open
          title={`Quotation ${preview.quotation.quotationNumber}`}
          html={buildQuotationHtml(preview.quotation, { paper: preview.paper, autoPrint: false })}
          paper={preview.paper}
          onClose={() => setPreview(null)}
          onPrint={() => printQuotation(preview.quotation, preview.paper)}
        />
      )}
    </div>
  );
}
