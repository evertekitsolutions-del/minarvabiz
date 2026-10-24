"use client";

import * as React from "react";
import { isDashboardCreateIntent } from "@/lib/dashboard-quick-create";
import { useRouter } from "next/navigation";
import { CustomerList, CustomerProfile, Modal, Button, FormField, inputClass } from "@minarvabiz/ui";
import { store, phase6Store, assertLimit, parseCustomerCsv, importCustomersFromCsv, exportCustomersCsv, can, setOpeningCustomerBalance } from "@minarvabiz/business-logic";
import type { Customer, CustomerCrmProfile } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

const emptyForm = { name: "", phone: "", email: "", address: "", notes: "" };

export default function CustomersPage() {
  const router = useRouter();
  const [list, setList] = React.useState<Customer[]>([]);
  const [profile, setProfile] = React.useState<CustomerCrmProfile | null>(null);
  const [openingBalanceTarget, setOpeningBalanceTarget] = React.useState<Customer | null>(null);
  const [openingBalanceAmount, setOpeningBalanceAmount] = React.useState("");
  const [openingBalanceError, setOpeningBalanceError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Customer | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [form, setForm] = React.useState(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const csvFileRef = React.useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = React.useState<{
    filename: string;
    content: string;
    rows: ReturnType<typeof parseCustomerCsv>["rows"];
    errors: string[];
  } | null>(null);
  const [csvBusy, setCsvBusy] = React.useState(false);
  const [csvStatus, setCsvStatus] = React.useState<string | null>(null);
  const [csvStatusIsError, setCsvStatusIsError] = React.useState(false);
  const lastSearchRef = React.useRef("");

  const refresh = React.useCallback((nextQuery?: string) => {
    if (nextQuery !== undefined) lastSearchRef.current = nextQuery;
    setList(store.listCustomers(lastSearchRef.current));
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);
  React.useEffect(() => {
    if (isDashboardCreateIntent(window.location.search)) {
      setEditTarget(null);
      setProfile(null);
      setForm(emptyForm);
      setError(null);
      setOpen(true);
    }
  }, []);


  function downloadCustomerCsv(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function previewCustomerCsv(file: File | null) {
    if (!file) return;
    setCsvBusy(true);
    setCsvStatus(null);
    setCsvStatusIsError(false);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Customer CSV exceeds 2 MB limit");
      const content = await file.text();
      const preview = parseCustomerCsv(content);
      setCsvPreview({ filename: file.name, content, rows: preview.rows, errors: preview.errors });
    } catch (error) {
      setCsvPreview(null);
      setCsvStatusIsError(true);
      setCsvStatus(error instanceof Error ? error.message : "Customer CSV preview failed");
    } finally {
      setCsvBusy(false);
      if (csvFileRef.current) csvFileRef.current.value = "";
    }
  }

  function confirmCustomerCsv() {
    if (!csvPreview || csvBusy || csvPreview.errors.length > 0 || csvPreview.rows.length === 0) return;
    setCsvBusy(true);
    setCsvStatus(null);
    setCsvStatusIsError(false);
    try {
      // Re-run full duplicate/license preflight against live data at confirmation time.
      const result = importCustomersFromCsv(csvPreview.content);
      if (result.errors.length) {
        setCsvPreview({ ...csvPreview, errors: result.errors });
        setCsvStatusIsError(true);
        setCsvStatus("Customer import refused; correct the CSV or existing duplicates.");
      } else {
        setCsvStatus(result.created + " customers imported. No opening balances or credit was created.");
        setCsvPreview(null);
        refresh();
      }
    } catch (error) {
      // Keep the preview so a failed import never appears successful.
      // Inspect the customer list before retrying if storage failed mid-write.
      setCsvStatusIsError(true);
      setCsvStatus(error instanceof Error ? `Customer import interrupted: ${error.message}` : "Customer import interrupted. Check the customer list before retrying.");
    } finally {
      setCsvBusy(false);
    }
  }

  function openCreate() {
    setEditTarget(null); setForm(emptyForm); setError(null); setOpen(true);
  }
  function openEdit(customer: Customer) {
    setEditTarget(customer);
    setForm({ name: customer.name, phone: customer.phone || "", email: customer.email || "", address: customer.address || "", notes: customer.notes || "" });
    setError(null); setOpen(true);
  }
  function save() {
    const parsed = customerSchema.safeParse({
      name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid input"); return; }
    try {
      if (editTarget) {
        if (!store.updateCustomer(editTarget.id, parsed.data)) throw new Error("Customer not found");
      } else {
        const limit = assertLimit("customers");
        if (!limit.allowed) throw new Error(limit.reason ?? "Customer limit reached");
        store.createCustomer(parsed.data);
      }
      if (editTarget && profile?.customer.id === editTarget.id) setProfile(phase6Store.getCustomerCrmProfile(editTarget.id));
      setOpen(false); setEditTarget(null); setForm(emptyForm); setError(null); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save customer"); }
  }
  function openOpeningBalance(customer: Customer) {
    setOpeningBalanceTarget({ ...customer });
    setOpeningBalanceAmount(String(customer.outstandingBalance ?? 0));
    setOpeningBalanceError(null);
  }
  function saveOpeningBalance() {
    if (!openingBalanceTarget) return;
    setOpeningBalanceError(null);
    try {
      if (!openingBalanceAmount.trim()) throw new Error("Enter an opening balance amount");
      const liveCustomer = store.getCustomer(openingBalanceTarget.id);
      if (!liveCustomer) throw new Error("Customer no longer exists");
      // The modal holds an immutable snapshot; refuse changes posted while
      // this form was open rather than silently rewriting a newer receivable.
      const openedCents = Math.round(Number(openingBalanceTarget.outstandingBalance) * 100);
      const liveCents = Math.round(Number(liveCustomer.outstandingBalance) * 100);
      if (!Number.isSafeInteger(openedCents) || !Number.isSafeInteger(liveCents) ||
          openedCents !== liveCents) {
        throw new Error("Customer balance changed. Close and reopen to review the new amount.");
      }
      const result = setOpeningCustomerBalance(liveCustomer.id, Number(openingBalanceAmount));
      if (!result.ok) throw new Error(result.error || "Opening balance was not saved");
      setOpeningBalanceTarget(null);
      setOpeningBalanceError(null);
      refresh();
      if (profile?.customer.id === liveCustomer.id) setProfile(phase6Store.getCustomerCrmProfile(liveCustomer.id));
    } catch (e) { setOpeningBalanceError(e instanceof Error ? e.message : "Unable to save opening balance"); }
  }
  function archive() {
    if (!archiveTarget) return;
    const result = store.archiveCustomer(archiveTarget.id, archiveReason);
    if (result.error) { setError(result.error); return; }
    setArchiveTarget(null); setArchiveReason(""); setError(null);
    if (profile?.customer.id === archiveTarget.id) setProfile(null);
    refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={csvBusy} onClick={() => csvFileRef.current?.click()}>Preview customer CSV</Button>
        <Button variant="outline" onClick={() => downloadCustomerCsv(
          "name,phone,email,address,notes\nSample Customer,+919876543210,sample@example.com,Kerala,Opening contact\n",
          "minarvabiz-customer-template.csv"
        )}>Download customer CSV template</Button>
        <Button variant="outline" onClick={() => downloadCustomerCsv(exportCustomersCsv(), "minarvabiz-customers.csv")}>Export customers CSV</Button>
        <input
          ref={csvFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Select customer CSV file"
          onChange={(event) => { void previewCustomerCsv(event.target.files?.[0] ?? null); }}
        />
      </div>
      {csvStatus && <p role={csvStatusIsError ? "alert" : "status"} className={`mb-3 text-sm ${csvStatusIsError ? "text-rose-700" : "text-slate-700"}`}>{csvStatus}</p>}
      <Modal
        open={Boolean(csvPreview)}
        title="Customer CSV import preview"
        className="max-w-xl"
        onClose={() => { if (!csvBusy) setCsvPreview(null); }}
        footer={<>
          <Button variant="outline" disabled={csvBusy} onClick={() => setCsvPreview(null)}>Cancel</Button>
          <Button disabled={!csvPreview || csvPreview.errors.length > 0 || csvPreview.rows.length === 0 || csvBusy}
            onClick={confirmCustomerCsv}>Confirm customer import</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{csvPreview?.filename}: {csvPreview?.rows.length ?? 0} customers in preview. No records have been saved yet.</p>
          <p className="text-xs text-slate-600">Review phone numbers, emails and duplicates. Opening balances, payments and debt are never imported by this tool.</p>
          {!!csvPreview?.errors.length && <div role="alert" className="rounded border border-rose-300 p-3 text-sm text-rose-700">
            <strong>{csvPreview.errors.length} validation issue(s)</strong>
            <ul className="mt-2 list-disc pl-5">{csvPreview.errors.slice(0, 15).map((msg, i) => <li key={i}>{msg}</li>)}</ul>
          </div>}
          {!!csvPreview?.rows.length && <div className="max-h-64 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead><tr><th className="p-2">Customer</th><th className="p-2">Phone</th><th className="p-2">Email</th></tr></thead>
              <tbody>{csvPreview.rows.slice(0, 15).map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{row.name}</td><td className="p-2">{row.phone || "—"}</td><td className="p-2">{row.email || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            {csvPreview.rows.length > 15 && <p className="p-2 text-xs text-slate-600">Showing first 15 of {csvPreview.rows.length} customers.</p>}
          </div>}
        </div>
      </Modal>
      <CustomerList customers={list} onAdd={openCreate} onSearch={refresh}
        onSetOpeningBalance={can("settings.manage") ? openOpeningBalance : undefined}
        onCollect={(customer) => router.push(`/payments?customerId=${encodeURIComponent(customer.id)}`)}
        onSelect={(c) => setProfile(phase6Store.getCustomerCrmProfile(c.id))}
        onEdit={openEdit} onArchive={(c) => { setArchiveTarget(c); setArchiveReason(""); setError(null); }} />
      <Modal open={Boolean(openingBalanceTarget)} title="Set Customer Opening Balance"
        onClose={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpeningBalanceTarget(null); setOpeningBalanceError(null); }}>Cancel</Button><Button disabled={!openingBalanceAmount.trim()} onClick={saveOpeningBalance}>Save opening balance</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Set the verified total receivable for {openingBalanceTarget?.name}. Any difference is posted to Accounts Receivable and Opening Balance Equity and recorded in the audit trail. This is not a payment.</p>
          <p className="text-sm text-slate-700">Current outstanding: <strong>{String(openingBalanceTarget?.outstandingBalance ?? 0)}</strong></p>
          <FormField label="Opening balance"><input className={inputClass} type="number" min="0" step="0.01" value={openingBalanceAmount} onChange={(event) => setOpeningBalanceAmount(event.target.value)} /></FormField>
          {openingBalanceError && <p role="alert" className="text-sm text-rose-600">{openingBalanceError}</p>}
        </div>
      </Modal>
      {profile && <div className="mt-6"><CustomerProfile profile={profile} onClose={() => setProfile(null)} /></div>}
      <Modal open={open} title={editTarget ? "Edit Customer" : "Add Customer"} onClose={() => { setOpen(false); setEditTarget(null); setError(null); }}
        footer={<><Button variant="outline" onClick={() => { setOpen(false); setEditTarget(null); }}>Cancel</Button><Button onClick={save}>{editTarget ? "Save Changes" : "Save Customer"}</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Address"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
      <Modal open={Boolean(archiveTarget)} title={archiveTarget ? `Delete / Archive Customer — ${archiveTarget.name}` : "Delete / Archive Customer"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setError(null); }}
        footer={<><Button variant="outline" onClick={() => setArchiveTarget(null)}>Keep Customer</Button><Button disabled={archiveReason.trim().length < 3} onClick={archive}>Delete / Archive Customer</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This removes the customer from the active list (soft archive). Historical invoices and audit records remain intact. Customers with an outstanding balance cannot be archived.</p>
          <FormField label="Deletion reason *"><textarea className={inputClass + " h-20 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
