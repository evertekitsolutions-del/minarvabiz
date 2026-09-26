import * as React from "react";
import { Button, Card, CardContent, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import {
  listQuotations,
  createQuotation,
  setQuotationStatus,
  convertQuotationToSale,
  convertQuotationToOrder,
  store,
} from "@minarvabiz/business-logic";
import type { QuotationStatus } from "@minarvabiz/types";
import { useDesktopPrintPreview } from "./useDesktopPrintPreview";

export function DesktopQuotationsView({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = React.useState(() => listQuotations());
  const [customerId, setCustomerId] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [price, setPrice] = React.useState(0);
  const [validUntil, setValidUntil] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const preview = useDesktopPrintPreview();
  const customers = store.listCustomers();

  function refresh() {
    setList(listQuotations());
    onChanged();
  }

  return (
    <div className="space-y-6">
      {preview.modal}
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Quotations / Estimates</h2>
        <p className="mt-1 text-sm text-slate-500">Create, preview and convert professional quotations.</p>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer">
            <select className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </FormField>
          <FormField label="Description"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} /></FormField>
          <FormField label="Qty"><input className={inputClass} type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></FormField>
          <FormField label="Unit price"><input className={inputClass} type="number" min="0" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} /></FormField>
          <FormField label="Valid until"><input className={inputClass} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></FormField>
          <FormField label="Notes" className="lg:col-span-2"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          <div className="flex items-end">
            <Button onClick={() => {
              if (!customerId || !desc.trim()) { setMsg("Select a customer and enter a description."); return; }
              const result = createQuotation({
                customerId,
                lines: [{ kind: "service", description: desc.trim(), quantity: qty, unitPrice: price }],
                validUntil: validUntil || null,
                notes: notes.trim() || null,
              });
              setMsg(result.errors.length ? result.errors.join(", ") : `Created ${result.quotation?.quotationNumber}`);
              if (!result.errors.length) { setDesc(""); setQty(1); setPrice(0); setValidUntil(""); setNotes(""); refresh(); }
            }}>Create quotation</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {list.map((quotation) => (
          <Card key={quotation.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-medium text-slate-900">{quotation.quotationNumber} · {quotation.customerName}</div>
                <div className="text-slate-500">{quotation.status} · Total {quotation.total} · Balance {quotation.balance}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select className={selectClass} value={quotation.status} onChange={(e) => {
                  const result = setQuotationStatus(quotation.id, e.target.value as QuotationStatus);
                  setMsg(result.error || null);
                  refresh();
                }}>
                  {["draft", "sent", "accepted", "rejected", "expired", "converted"].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => preview.openQuotation(quotation, "a4")}>A4 Preview</Button>
                <Button size="sm" variant="outline" onClick={() => preview.openQuotation(quotation, "thermal")}>Thermal Preview</Button>
                <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToSale(quotation.id); setMsg(result.error || `Sale ${result.saleId}`); refresh(); }}>→ Sale</Button>
                <Button size="sm" variant="outline" onClick={() => { const result = convertQuotationToOrder(quotation.id); setMsg(result.error || `Order ${result.orderId}`); refresh(); }}>→ Order</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!list.length && <p className="text-sm text-slate-400">No quotations yet</p>}
      </div>
    </div>
  );
}
