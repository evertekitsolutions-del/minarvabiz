"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import {
  store,
  printProductLabels,
  importProductsFromCsv,
  exportProductsCsv,
  getTaxConfig,
  updateTaxConfig,
  parseDefaultTaxRateInput,
  openWhatsApp,
  templatePaymentDue,
} from "@minarvabiz/business-logic";

export default function ToolsPage() {
  const [tax, setTax] = React.useState(() => getTaxConfig());
  const [rateDraft, setRateDraft] = React.useState(() => String(getTaxConfig().defaultRatePercent));
  const [rateError, setRateError] = React.useState<string | null>(null);
  const [csvMsg, setCsvMsg] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function saveDefaultTaxRate() {
    try {
      const defaultRatePercent = parseDefaultTaxRateInput(rateDraft);
      setTax(updateTaxConfig({ defaultRatePercent }));
      setRateDraft(String(defaultRatePercent));
      setRateError(null);
    } catch (error) {
      setRateError(error instanceof Error ? error.message : "Unable to save the default GST rate.");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">Tools</h2>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">GST / Tax</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tax.enableGst}
              onChange={(e) => setTax(updateTaxConfig({ enableGst: e.target.checked }))}
            />
            Enable GST on invoices
          </label>
          <label htmlFor="default-tax-rate" className="block text-sm">Default rate %</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="default-tax-rate"
              type="number"
              min="0"
              max="100"
              step="any"
              aria-invalid={Boolean(rateError)}
              aria-describedby={rateError ? "default-tax-rate-error" : undefined}
              className="h-9 w-32 rounded-lg border border-slate-200 px-2"
              value={rateDraft}
              onChange={(e) => { setRateDraft(e.target.value); setRateError(null); }}
            />
            <Button type="button" variant="outline" onClick={saveDefaultTaxRate} disabled={rateDraft.trim() === String(tax.defaultRatePercent)}>Save default rate</Button>
          </div>
          {rateError && <p id="default-tax-rate-error" role="alert" className="text-sm text-rose-700">{rateError}</p>}
          <p className="text-xs text-slate-500">Rates: {tax.rates.map((r) => r.name).join(", ")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Barcode labels</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={() => printProductLabels(store.listProducts().slice(0, 20))}>
            Print labels (first 20 products)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Import products CSV</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500">Columns: name,sku,barcode,cost,price,stock,min,unit. Import is validated fully before any product is created.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const blob = new Blob([exportProductsCsv()], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `minarvabiz-products-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export current products CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const input = e.currentTarget;
              setCsvMsg(null);
              try {
                const text = await f.text();
                const result = importProductsFromCsv(text);
                setCsvMsg(result.errors.length
                  ? `Import blocked. ${result.errors.join("; ")}`
                  : `Imported ${result.created} product(s) safely.`);
              } catch {
                setCsvMsg("Unable to read or import this CSV. Check the file format and try again.");
              } finally {
                input.value = "";
              }
            }}
          />
          {csvMsg && <p role="status" aria-live="polite" className="text-sm text-slate-600">{csvMsg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">WhatsApp quick message</CardTitle></CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              const c = store.listOutstandingCustomers()[0];
              if (!c?.phone) {
                alert("No outstanding customer with phone");
                return;
              }
              const msg = templatePaymentDue(c);
              openWhatsApp(c.phone, msg.body);
            }}
          >
            Remind first outstanding via WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
