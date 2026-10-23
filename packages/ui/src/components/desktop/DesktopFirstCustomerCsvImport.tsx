"use client";

import * as React from "react";
import {
  can, parseProductCsv, parseCustomerCsv, parseSupplierCsv,
  importProductsFromCsv, importCustomersFromCsv, importSuppliersFromCsv,
  type Permission,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { createDurableCsvImport, type FirstCustomerCsvKind } from "./durable-csv-import";

const limits: Record<FirstCustomerCsvKind, number> = {
  products: 10 * 1024 * 1024, customers: 2 * 1024 * 1024, suppliers: 2 * 1024 * 1024,
};
const headers: Record<FirstCustomerCsvKind, string> = {
  products: "name,sku,barcode,cost,price,stock,min,unit",
  customers: "name,phone,email,address,notes",
  suppliers: "name,company,phone,email,address,category,notes",
};
const permissions: Record<FirstCustomerCsvKind, Permission> = {
  products: "products.manage", customers: "customers.manage", suppliers: "purchases.manage",
};
const importer = createDurableCsvImport({
  products: { preview: parseProductCsv, apply: importProductsFromCsv },
  customers: { preview: parseCustomerCsv, apply: importCustomersFromCsv },
  suppliers: { preview: parseSupplierCsv, apply: importSuppliersFromCsv },
}, async () => {
  const flush = (window as Window & { __minarvaDesktopFlush?: () => Promise<boolean> }).__minarvaDesktopFlush;
  if (!flush) throw new Error("The native Windows SQLite save bridge is unavailable.");
  return flush();
});

export function DesktopFirstCustomerCsvImport({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = React.useState<FirstCustomerCsvKind>("products");
  const [fileName, setFileName] = React.useState("");
  const [csv, setCsv] = React.useState("");
  const [rowCount, setRowCount] = React.useState(0);
  const [rows, setRows] = React.useState<readonly unknown[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState(() => importer.hasPending());
  const [reviewRequired, setReviewRequired] = React.useState(() => importer.requiresReview());

  function clearPreview() {
    setCsv(""); setFileName(""); setRows([]); setRowCount(0); setErrors([]); setMessage("");
  }

  function selectKind(value: FirstCustomerCsvKind) {
    if (busyRef.current || importer.hasPending() || importer.requiresReview()) return;
    setKind(value);
    clearPreview();
  }

  async function loadFile(file?: File) {
    if (!file || busyRef.current || importer.hasPending() || importer.requiresReview()) return;
    clearPreview();
    if (file.size > limits[kind]) {
      setErrors([kind + " CSV exceeds the allowed file size."]);
      return;
    }
    setBusy(true);
    busyRef.current = true;
    try {
      const text = await file.text();
      // Parse on read, and re-parse in the business-logic importer at commit.
      const parsed = importer.preview(kind, text);
      setFileName(file.name);
      setCsv(text);
      setRows(parsed.rows.slice(0, 5));
      setRowCount(parsed.rows.length);
      setErrors(parsed.errors.slice(0, 30));
      if (parsed.errors.length > 30) setErrors(v => [...v, `…plus ${parsed.errors.length - 30} more errors`]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Unable to read the CSV file."]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (busyRef.current || importer.hasPending() || importer.requiresReview() || !can(permissions[kind]) || errors.length || !rowCount) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await importer.commit(kind, csv);
      if (result.ok) {
        clearPreview();
        setMessage(`Imported and saved ${result.created} ${kind} to SQLite.`);
        onSaved();
      } else {
        setMessage(result.error || "CSV import failed.");
      }
      setPending(importer.hasPending());
      setReviewRequired(importer.requiresReview());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function retrySave() {
    if (busyRef.current || !importer.hasPending()) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await importer.retryPersist();
      if (result.ok) {
        clearPreview();
        setMessage(`Existing ${result.created} records saved. No duplicate import was run.`);
        onSaved();
      } else setMessage(result.error || "SQLite save not confirmed.");
      setPending(importer.hasPending());
      setReviewRequired(importer.requiresReview());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([headers[kind] + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = "minarvabiz-" + kind + "-template.csv";
    document.body.appendChild(element);
    element.click();
    element.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const blocked = busy || pending || reviewRequired || !can(permissions[kind]);
  return (
    <section aria-label="First customer CSV import" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Import opening data from CSV</h3>
      <p className="mt-1 text-xs text-slate-600">
        Reuse existing product, customer and supplier master import engines. Preview before creating records.
        Receivables, payables and bank/cash opening balances must be posted separately through the accounting workflow.
      </p>
      {reviewRequired && <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        CSV import outcome is uncertain. New imports are blocked for this session. Review existing master records and reconcile them with a trusted backup before taking further action. Do not retry the same CSV blindly.
      </div>}
      {pending && <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Imported {importer.pendingKind()} records are already in memory, but SQLite save is unconfirmed.
        Do not close Minarva Biz or import another file. Retry saving the existing records.
        <div className="mt-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void retrySave()}>
          Retry saving existing records
        </Button></div>
      </div>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-700">
          Data type
          <select className="mt-1 block rounded-md border border-slate-300 p-2 text-sm" value={kind}
            disabled={busy || pending} onChange={e => selectKind(e.target.value as FirstCustomerCsvKind)}>
            <option value="products">Products + opening quantities</option>
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers</option>
          </select>
        </label>
        <Button type="button" variant="outline" onClick={downloadTemplate}>Download CSV template</Button>
        <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          {fileName || "Select CSV file"}
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={blocked}
            onChange={e => { const file=e.target.files?.[0]; e.target.value=""; void loadFile(file); }} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">Columns: <code>{headers[kind]}</code></p>
      {errors.length > 0 && <ul className="mt-2 max-h-44 list-disc overflow-y-auto pl-5 text-xs text-rose-700">
        {errors.map((error, i) => <li key={i}>{error}</li>)}
      </ul>}
      {rowCount > 0 && errors.length === 0 && <div className="mt-3">
        <p className="text-sm text-slate-700">{rowCount} rows validated — showing first {rows.length} for operator review.</p>
        <div className="mt-2 max-h-40 overflow-auto rounded-md bg-white p-2 text-xs">
          {rows.map((row, index) => <pre key={index} className="whitespace-pre-wrap break-all border-b border-slate-100 py-1">{JSON.stringify(row)}</pre>)}
        </div>
        <Button type="button" disabled={blocked} onClick={() => void confirmImport()}>Confirm & save {rowCount} {kind}</Button>
      </div>}
      {message && <p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
      <p className="mt-3 text-xs text-slate-500">Existing rows and licensing permissions are checked again at confirmation. A successful import requires native SQLite acknowledgment. This is not proof of financial opening balance reconciliation.</p>
    </section>
  );
}
