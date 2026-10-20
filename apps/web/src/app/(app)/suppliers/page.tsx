"use client";

import * as React from "react";
import { parseSupplierPaymentAmount } from "@/lib/supplier-payment-draft";
import { SupplierList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { phase5Store, parseSupplierCsv, importSuppliersFromCsv, exportSuppliersCsv, can, setOpeningSupplierBalance } from "@minarvabiz/business-logic";
import type { PaymentMethod, Supplier } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }
const emptyForm = { name: "", company: "", phone: "", email: "", address: "", category: "materials", openingBalance: "", notes: "" };

export default function SuppliersPage() {
  const [list, setList] = React.useState<Supplier[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Supplier | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Supplier | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [openingBalanceTarget, setOpeningBalanceTarget] = React.useState<Supplier | null>(null);
  const [openingBalanceAmount, setOpeningBalanceAmount] = React.useState("");
  const [openingBalanceError, setOpeningBalanceError] = React.useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [paymentSupplier, setPaymentSupplier] = React.useState<Supplier | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [supplierError, setSupplierError] = React.useState<string | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({ date: todayLocal(), amount: "", paymentMethod: "cash" as PaymentMethod, reference: "", notes: "" });
  const [form, setForm] = React.useState(emptyForm);
  const supplierCsvInput = React.useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = React.useState<{
    filename: string; content: string; rows: ReturnType<typeof parseSupplierCsv>["rows"]; errors: string[];
  } | null>(null);
  const [csvBusy, setCsvBusy] = React.useState(false);
  const [csvStatus, setCsvStatus] = React.useState<string | null>(null);


  const refresh = React.useCallback((q?: string) => setList(phase5Store.listSuppliers(q)), []);
  React.useEffect(() => { refresh(); }, [refresh]);

  function downloadSupplierCsv(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function previewSupplierCsv(file: File | null) {
    if (!file) return;
    setCsvBusy(true);
    setCsvStatus(null);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Supplier CSV exceeds 2 MB limit");
      const content = await file.text();
      const parsed = parseSupplierCsv(content);
      setCsvPreview({ filename: file.name, content, rows: parsed.rows, errors: parsed.errors });
    } catch (error) {
      setCsvPreview(null);
      setCsvStatus(error instanceof Error ? error.message : "Supplier CSV preview failed");
    } finally {
      setCsvBusy(false);
      if (supplierCsvInput.current) supplierCsvInput.current.value = "";
    }
  }

  function confirmSupplierCsv() {
    if (!csvPreview || csvBusy || csvPreview.errors.length > 0 || csvPreview.rows.length === 0) return;
    setCsvBusy(true);
    try {
      const result = importSuppliersFromCsv(csvPreview.content);
      if (result.errors.length) {
        setCsvPreview({ ...csvPreview, errors: result.errors });
        setCsvStatus("Supplier import refused. Review validation issues and existing duplicates.");
      } else {
        setCsvStatus(result.created + " supplier masters imported with zero opening payables.");
        setCsvPreview(null);
        refresh();
      }
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : "Supplier CSV import failed");
    } finally {
      setCsvBusy(false);
    }
  }

  function openCreate() { setEditTarget(null); setForm(emptyForm); setSupplierError(null); setOpen(true); }
  function openEdit(supplier: Supplier) {
    setEditTarget(supplier);
    setForm({ name: supplier.name, company: supplier.company || "", phone: supplier.phone || "", email: supplier.email || "", address: supplier.address || "", category: supplier.category || "general", openingBalance: String(supplier.openingBalance), notes: supplier.notes || "" });
    setSupplierError(null); setOpen(true);
  }
  function save() {
    if (!form.name.trim()) { setSupplierError("Supplier name is required"); return; }
    try {
      if (editTarget) {
        if (!phase5Store.updateSupplier(editTarget.id, { name: form.name.trim(), company: form.company.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, category: form.category || null, notes: form.notes.trim() || null })) throw new Error("Supplier not found");
      } else {
        phase5Store.createSupplier({ ...form, openingBalance: form.openingBalance.trim() ? Number(form.openingBalance) : 0 });
      }
      setOpen(false); setEditTarget(null); setSupplierError(null); setForm(emptyForm); refresh();
    } catch (error) { setSupplierError(error instanceof Error ? error.message : String(error)); }
  }
  function archive() {
    if (!archiveTarget) return;
    const result = phase5Store.archiveSupplier(archiveTarget.id, archiveReason);
    if (result.error) { setSupplierError(result.error); return; }
    setArchiveTarget(null); setArchiveReason(""); setSupplierError(null); refresh();
  }
  function openOpeningBalance(supplier: Supplier) {
    if (!can("settings.manage")) return;
    setOpeningBalanceTarget({ ...supplier });
    setOpeningBalanceAmount(String(supplier.outstandingBalance ?? 0));
    setOpeningBalanceError(null);
  }
  function saveOpeningBalance() {
    if (!openingBalanceTarget) return;
    setOpeningBalanceError(null);
    try {
      if (!can("settings.manage")) throw new Error("Permission denied");
      if (!openingBalanceAmount.trim()) throw new Error("Enter an opening payable amount");
      const liveSupplier = phase5Store.getSupplier(openingBalanceTarget.id);
      if (!liveSupplier) throw new Error("Supplier no longer exists");
      // New purchases or payments can change the payable while the dialog is open.
      // Never overwrite a newer total from an old form snapshot.
      const openedCents = Math.round(Number(openingBalanceTarget.outstandingBalance) * 100);
      const liveCents = Math.round(Number(liveSupplier.outstandingBalance) * 100);
      if (!Number.isSafeInteger(openedCents) || !Number.isSafeInteger(liveCents) ||
          openedCents !== liveCents) {
        throw new Error("Supplier payable changed. Close and reopen to review the new amount.");
      }
      const result = setOpeningSupplierBalance(liveSupplier.id, Number(openingBalanceAmount));
      if (!result.ok) throw new Error(result.error || "Opening payable was not saved");
      setOpeningBalanceTarget(null);
      setOpeningBalanceError(null);
      refresh();
    } catch (error) {
      setOpeningBalanceError(error instanceof Error ? error.message : "Unable to save opening payable");
    }
  }
  function openPayment(supplier: Supplier) {
    setPaymentSupplier(supplier); setPaymentError(null);
    setPaymentForm({ date: todayLocal(), amount: String(supplier.outstandingBalance), paymentMethod: "cash", reference: "", notes: "" });
    setPaymentOpen(true);
  }
  function savePayment() {
    if (!paymentSupplier) return;
    setPaymentError(null);
    try {
      // Re-read the live payable; old dialog prefill may have become stale.
      const supplier = phase5Store.listSuppliers().find((item) => item.id === paymentSupplier.id);
      if (!supplier) throw new Error("Supplier no longer exists.");
      const amount = parseSupplierPaymentAmount(paymentForm.amount, supplier.outstandingBalance);
      const result = phase5Store.recordSupplierPayment({
        supplierId: supplier.id,
        amount,
        paymentMethod: paymentForm.paymentMethod,
        date: paymentForm.date,
        reference: paymentForm.reference || null,
        notes: paymentForm.notes || null,
      });
      if (result.errors.length || !result.payment) {
        setPaymentError(result.errors.join("; ") || "Supplier payment was not recorded.");
        return;
      }
      setPaymentOpen(false);
      setPaymentSupplier(null);
      setPaymentError(null);
      refresh();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Supplier payment was not recorded.");
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={csvBusy} onClick={() => supplierCsvInput.current?.click()}>Preview supplier CSV</Button>
        <Button variant="outline" onClick={() => downloadSupplierCsv(
          "name,company,phone,email,address,category,notes\nExample Supplier,Example Company,+919876543210,supplier@example.com,Kerala,materials,Opening supplier master\n",
          "minarvabiz-supplier-template.csv"
        )}>Download supplier CSV template</Button>
        <Button variant="outline" onClick={() => downloadSupplierCsv(exportSuppliersCsv(), "minarvabiz-suppliers.csv")}>Export suppliers CSV</Button>
        <input ref={supplierCsvInput} type="file" accept=".csv,text/csv" className="hidden"
          aria-label="Select supplier CSV file"
          onChange={event => { void previewSupplierCsv(event.target.files?.[0] ?? null); }} />
      </div>
      {csvStatus && <p role="status" className="mb-3 text-sm text-slate-700">{csvStatus}</p>}
      <Modal open={Boolean(csvPreview)} title="Supplier CSV import preview" className="max-w-xl"
        onClose={() => { if (!csvBusy) setCsvPreview(null); }}
        footer={<>
          <Button variant="outline" disabled={csvBusy} onClick={() => setCsvPreview(null)}>Cancel</Button>
          <Button disabled={!csvPreview || csvPreview.errors.length > 0 || csvPreview.rows.length === 0 || csvBusy}
            onClick={confirmSupplierCsv}>Confirm supplier import</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{csvPreview?.filename}: {csvPreview?.rows.length ?? 0} suppliers in preview. No records have been saved.</p>
          <p className="text-xs text-slate-600">Imports supplier master details only. Opening balances and Accounts Payable must be entered separately through reconciled accounting controls.</p>
          {!!csvPreview?.errors.length && <div role="alert" className="rounded border border-rose-300 p-3 text-sm text-rose-700">
            <strong>{csvPreview.errors.length} validation issue(s)</strong>
            <ul className="mt-2 list-disc pl-5">{csvPreview.errors.slice(0, 15).map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          </div>}
          {!!csvPreview?.rows.length && <div className="max-h-64 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead><tr><th className="p-2">Supplier</th><th className="p-2">Company</th><th className="p-2">Phone</th><th className="p-2">Email</th></tr></thead>
              <tbody>{csvPreview.rows.slice(0, 15).map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{row.name}</td><td className="p-2">{row.company || "—"}</td>
                  <td className="p-2">{row.phone || "—"}</td><td className="p-2">{row.email || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            {csvPreview.rows.length > 15 && <p className="p-2 text-xs text-slate-600">Showing first 15 of {csvPreview.rows.length} suppliers.</p>}
          </div>}
        </div>
      </Modal>
      <SupplierList suppliers={list} onAdd={openCreate} onSearch={refresh} onPay={openPayment} onEdit={openEdit}
        onSetOpeningBalance={can("settings.manage") ? openOpeningBalance : undefined}
        onArchive={(s) => { setArchiveTarget(s); setArchiveReason(""); setSupplierError(null); }} />
      <Modal open={open} title={editTarget ? "Edit Supplier" : "Add Supplier"} onClose={() => { setOpen(false); setEditTarget(null); setSupplierError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpen(false); setEditTarget(null); }}>Cancel</Button><Button onClick={save}>{editTarget ? "Save Changes" : "Save Supplier"}</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Company"><input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Address"><textarea className={inputClass + " h-auto py-2"} rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField>
          <FormField label="Category"><select className={selectClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="laundry">Laundry</option><option value="materials">Materials</option><option value="general">General</option></select></FormField>
          <FormField label="Opening balance"><input className={inputClass} type="number" min="0" step="0.01" disabled={Boolean(editTarget)} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /><p className="mt-1 text-xs text-slate-500">{editTarget ? "Opening balance is an accounting source and cannot be edited here." : "Non-zero opening balances post to Accounts Payable and Opening Balance Equity."}</p></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-auto py-2"} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
      <Modal open={Boolean(archiveTarget)} title={archiveTarget ? `Archive Supplier — ${archiveTarget.name}` : "Archive Supplier"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setSupplierError(null); }}
        footer={<><Button variant="outline" onClick={() => setArchiveTarget(null)}>Keep Supplier</Button><Button disabled={archiveReason.trim().length < 3} onClick={archive}>Archive Supplier</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This is a soft archive. Historical purchases, payments and audit records remain intact. Suppliers with outstanding payables cannot be archived.</p>
          <FormField label="Archive reason *"><textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {supplierError && <p className="text-sm text-rose-600">{supplierError}</p>}
        </div>
      </Modal>
      <Modal open={Boolean(openingBalanceTarget)} title="Set Supplier Opening Payable"
        onClose={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}>Cancel</Button><Button disabled={!openingBalanceAmount.trim()} onClick={saveOpeningBalance}>Save opening payable</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Set the verified <strong>total current payable</strong> for {openingBalanceTarget?.name}. The difference is posted to Accounts Payable and Opening Balance Equity with an audit record. This is not a supplier payment.</p>
          <p className="text-sm text-slate-700">Current outstanding: <strong>{String(openingBalanceTarget?.outstandingBalance ?? 0)}</strong>. Check existing purchases and payments before changing this value.</p>
          <FormField label="Total opening payable"><input className={inputClass} type="number" min="0" step="0.01" value={openingBalanceAmount} onChange={(event) => setOpeningBalanceAmount(event.target.value)} /></FormField>
          {openingBalanceError && <p role="alert" className="text-sm text-rose-600">{openingBalanceError}</p>}
        </div>
      </Modal>
      <Modal open={paymentOpen} title="Record Supplier Payment" onClose={() => setPaymentOpen(false)} footer={<><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button onClick={savePayment}>Record Payment</Button></>}>
        <div className="space-y-3"><p className="text-sm text-slate-600">{paymentSupplier?.name} · Outstanding <strong>{paymentSupplier?.outstandingBalance.toFixed(2)}</strong>. The amount cannot exceed the current payable.</p><FormField label="Date"><input className={inputClass} type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} /></FormField><FormField label="Amount"><input className={inputClass} type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></FormField><FormField label="Payment method"><select className={selectClass} value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option></select></FormField><FormField label="Reference"><input className={inputClass} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></FormField><FormField label="Notes"><input className={inputClass} value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></FormField>{paymentError && <p role="alert" className="text-sm text-rose-600">{paymentError}</p>}</div>
      </Modal>
    </>
  );
}
