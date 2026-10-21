"use client";

import * as React from "react";
import type { Product, Supplier } from "@minarvabiz/types";
import { buildRfqDraftPreview, normalizeLocalizedRfqQuantity, phase9Store, type RfqDraftPreview, type SupportedInputLocale } from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

interface DraftLine { productId: string; quantity: string }

export function RfqDraftPanel({ products, suppliers }: {
  products: readonly Product[];
  suppliers: readonly Supplier[];
}) {
  const [reference, setReference] = React.useState("");
  const [quantityLocale, setQuantityLocale] = React.useState<SupportedInputLocale>("en-IN");
  const [requiredBy, setRequiredBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [supplierIds, setSupplierIds] = React.useState<string[]>([]);
  const [lines, setLines] = React.useState<DraftLine[]>([{ productId: "", quantity: "1" }]);
  const [preview, setPreview] = React.useState<RfqDraftPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const branchId = phase9Store.getActiveBranch()?.id ?? null;
  const availableSuppliers = suppliers.filter(s =>
    !s.deletedAt && (s.branchId == null || s.branchId === branchId));
  const availableProducts = products.filter(p =>
    !p.deletedAt && p.isActive && (p.branchId == null || p.branchId === branchId));

  function toggleSupplier(id: string, checked: boolean) {
    setSupplierIds(current => checked ? (current.includes(id) ? current : [...current, id])
      : current.filter(other => other !== id));
    setPreview(null);
  }

  function createPreview() {
    setError(null);
    setPreview(null);
    try {
      setPreview(buildRfqDraftPreview({
        reference, requiredBy, notes, supplierIds,
        lines: lines.map(line => ({...line, quantity: normalizeLocalizedRfqQuantity(line.quantity, quantityLocale)})),
      }, products, suppliers, phase9Store.getActiveBranch()?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot preview RFQ");
    }
  }

  function exportCsv() {
    if (!preview) return;
    setError(null);
    try {
      const url = URL.createObjectURL(new Blob(["\uFEFF", preview.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-rfq-" + preview.requiredBy + ".csv";
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "RFQ export failed");
    }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">
        Request supplier quotations (RFQ)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Prepare a multi-supplier enquiry with quantities and a requested delivery date.
        Preview and export only: no purchase order, vendor message, payment or stock entry is created.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">
          RFQ reference
          <input aria-label="RFQ reference" className={inputClass + " mt-1"} maxLength={128}
            value={reference} onChange={e => { setReference(e.target.value); setPreview(null); }}
            placeholder="RFQ-2026-001" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Required delivery date
          <input aria-label="RFQ required date" type="date" className={inputClass + " mt-1"}
            value={requiredBy} onChange={e => { setRequiredBy(e.target.value); setPreview(null); }} />
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">
          Supplier enquiry notes
          <input aria-label="RFQ notes" className={inputClass + " mt-1"} maxLength={500}
            value={notes} onChange={e => { setNotes(e.target.value); setPreview(null); }}
            placeholder="Delivery terms or technical specifications" />
        </label>
      </div>
      <fieldset className="mt-4 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-700">Suppliers to request quotes from (max 25)</legend>
        {availableSuppliers.length === 0 && <p className="text-xs text-slate-500">Create a supplier before drafting an RFQ.</p>}
        <div className="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
          {availableSuppliers.slice(0, 200).map(supplier => (
            <label key={supplier.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={supplierIds.includes(supplier.id)}
                disabled={!supplierIds.includes(supplier.id) && supplierIds.length >= 25}
                onChange={e => toggleSupplier(supplier.id, e.target.checked)} />
              {supplier.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Requested products and quantities (max 50)</p>
          <label className="text-xs font-medium text-slate-600">Quantity input locale
            <select aria-label="RFQ quantity input locale" className={selectClass + " ml-2"} value={quantityLocale}
              onChange={e => {setQuantityLocale(e.target.value as SupportedInputLocale);setPreview(null);setError(null);}}>
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (US)</option>
              <option value="de-DE">German</option>
              <option value="fr-FR">French</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">International quantity entry: 1,25 or 1.25 means 1.25. A single separator always means a decimal, not a thousands separator; 1,234 means 1.234. The maximum precision is 0.001 units. No financial posting.</p>
        {lines.map((line, i) => (
          <div className="flex flex-wrap gap-2" key={i}>
            <select aria-label={"RFQ product " + (i+1)} className={selectClass + " min-w-48 flex-1"}
              value={line.productId} onChange={e => {
                setLines(current => current.map((entry,j) => j===i ? {...entry,productId:e.target.value} : entry));
                setPreview(null);
              }}>
              <option value="">Select product</option>
              {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? " · " + p.sku : ""}</option>)}
            </select>
            <input aria-label={"RFQ quantity " + (i+1)} className={inputClass + " w-28"}
              value={line.quantity} inputMode="decimal" placeholder="Quantity" onChange={e => {
                setLines(current => current.map((entry,j) => j===i ? {...entry,quantity:e.target.value} : entry));
                setPreview(null);
              }} />
            <Button variant="outline" size="sm" disabled={lines.length === 1} onClick={() => {
              setLines(current => current.filter((_, j) => j !== i));
              setPreview(null);
            }}>Remove RFQ item</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" disabled={lines.length >= 50} onClick={() => {
          setLines(current => [...current,{productId:"",quantity:"1"}]);
          setPreview(null);
        }}>Add RFQ item</Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={createPreview} size="sm">Preview RFQ</Button>
        {preview && <Button onClick={exportCsv} variant="outline" size="sm">Export RFQ CSV</Button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {preview && (
        <div className="mt-3 space-y-2" role="status">
          <p className="text-sm font-medium text-slate-900">
            RFQ {preview.reference}: {preview.supplierCount} supplier(s) × {preview.productCount} product(s) = {preview.rows.length} enquiry lines.
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-slate-600">
                <th className="p-2">Supplier</th><th className="p-2">Product</th><th className="p-2">Qty</th>
              </tr></thead>
              <tbody>{preview.rows.slice(0,100).map(row => (
                <tr key={row.supplierId + ":" + row.productId} className="border-b border-slate-100">
                  <td className="p-2">{row.supplierName}</td>
                  <td className="p-2">{row.productName}</td>
                  <td className="p-2">{row.quantity} {row.unit}</td>
                </tr>
              ))}</tbody>
            </table>
            {preview.rows.length > 100 && <p className="p-2 text-xs text-slate-500">Showing first 100 lines; CSV contains all rows.</p>}
          </div>
        </div>
      )}
    </details>
  );
}
