"use client";

import * as React from "react";
import { Button, Card, CardContent, FormField, inputClass, selectClass, PrintPreviewModal } from "@minarvabiz/ui";
import {
  listQuotations,
  createQuotation,
  setQuotationStatus,
  convertQuotationToSale,
  convertQuotationToOrder,
  buildQuotationHtml,
  printPreparedHtml,
  store,
} from "@minarvabiz/business-logic";
import type { QuotationStatus } from "@minarvabiz/types";

export default function QuotationsPage() {
  const [list, setList] = React.useState(() => listQuotations());
  const [customerId, setCustomerId] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [price, setPrice] = React.useState(0);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [printPreview, setPrintPreview] = React.useState<{ title: string; html: string; paper: "a4" | "thermal" } | null>(null);
  const customers = store.listCustomers();

  const refresh = () => setList(listQuotations());

  function previewQuotation(id: string, paper: "a4" | "thermal") {
    const quotation = listQuotations().find((item) => item.id === id);
    if (!quotation) return;
    setPrintPreview({
      title: `${quotation.quotationNumber} — ${paper === "a4" ? "A4" : "Thermal"} Preview`,
      html: buildQuotationHtml(quotation, { paper, autoPrint: false }),
      paper,
    });
  }

  return (
    <div className="space-y-6">
      <PrintPreviewModal
        open={Boolean(printPreview)}
        title={printPreview?.title || "Quotation Preview"}
        html={printPreview?.html || ""}
        paper={printPreview?.paper || "a4"}
        onClose={() => setPrintPreview(null)}
        onPrint={() => { if (printPreview) printPreparedHtml(printPreview.html, printPreview.paper); }}
      />
      <h2 className="text-xl font-semibold">Quotations / Estimates</h2>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer">
            <select className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Description">
            <input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </FormField>
          <FormField label="Qty">
            <input className={inputClass} type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </FormField>
          <FormField label="Unit price">
            <input className={inputClass} type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </FormField>
          <div className="flex items-end">
            <Button
              onClick={() => {
                if (!customerId || !desc) return;
                const r = createQuotation({
                  customerId,
                  lines: [{ kind: "service", description: desc, quantity: qty, unitPrice: price }],
                });
                setMsg(r.errors.length ? r.errors.join(", ") : `Created ${r.quotation?.quotationNumber}`);
                refresh();
              }}
            >
              Create quotation
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {list.map((q) => (
          <Card key={q.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div>
                <div className="font-medium">{q.quotationNumber} · {q.customerName}</div>
                <div className="text-slate-500">
                  {q.status} · Total {q.total} · Balance {q.balance}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className={selectClass}
                  value={q.status}
                  onChange={(e) => {
                    setQuotationStatus(q.id, e.target.value as QuotationStatus);
                    refresh();
                  }}
                >
                  {["draft", "sent", "accepted", "rejected", "expired", "converted"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => previewQuotation(q.id, "a4")}>A4 Preview</Button>
                <Button size="sm" variant="outline" onClick={() => previewQuotation(q.id, "thermal")}>Thermal Preview</Button>
                <Button size="sm" variant="outline" onClick={() => { const r = convertQuotationToSale(q.id); setMsg(r.error || `Sale ${r.saleId}`); refresh(); }}>→ Sale</Button>
                <Button size="sm" variant="outline" onClick={() => { const r = convertQuotationToOrder(q.id); setMsg(r.error || `Order ${r.orderId}`); refresh(); }}>→ Order</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!list.length && <p className="text-sm text-slate-400">No quotations yet</p>}
      </div>
    </div>
  );
}
