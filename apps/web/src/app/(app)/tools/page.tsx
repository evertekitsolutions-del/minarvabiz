"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
import {
  store,
  printProductLabels,
  importProductsFromCsv,
  getTaxConfig,
  updateTaxConfig,
  openWhatsApp,
  templatePaymentDue,
} from "@minarvabiz/business-logic";

export default function ToolsPage() {
  const [tax, setTax] = React.useState(() => getTaxConfig());
  const [csvMsg, setCsvMsg] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

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
          <label className="block text-sm">
            Default rate %
            <input
              type="number"
              className="mt-1 h-9 w-32 rounded-lg border border-slate-200 px-2"
              value={tax.defaultRatePercent}
              onChange={(e) =>
                setTax(updateTaxConfig({ defaultRatePercent: parseFloat(e.target.value) || 0 }))
              }
            />
          </label>
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
          <p className="text-xs text-slate-500">Columns: name,sku,barcode,cost,price,stock,min,unit</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              const result = importProductsFromCsv(text);
              setCsvMsg(`Created ${result.created}. ${result.errors.join("; ") || "OK"}`);
            }}
          />
          {csvMsg && <p className="text-sm text-slate-600">{csvMsg}</p>}
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
