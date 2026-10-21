"use client";

import * as React from "react";
import type { CartLine } from "@minarvabiz/types";
import {
  calculateCartTotals, quoteInclusiveMrpUnitPrice,
  type InclusiveMrpUnitQuote,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";

/**
 * An optional per-line ENTRY aid, never a second pricing engine.
 * Applies ONLY the validated exclusive unit rate; original POS checkout,
 * payment, posting, returns and offline-sync remain authoritative.
 */
export function InclusiveMrpEditor({
  line, onApply, onCancel,
}: {
  line: CartLine;
  onApply: (quote: InclusiveMrpUnitQuote) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = React.useState(() =>
    calculateCartTotals([{ ...line, quantity: 1, discountPercent: 0 }])
      .grandTotal.toFixed(2),
  );
  const [error, setError] = React.useState<string | null>(null);
  const taxRate = line.taxRate ?? 0;

  return <div className="space-y-2 rounded-md border border-indigo-200 bg-white p-2">
    <label className="block text-xs font-medium text-slate-700">
      MRP incl. tax ({taxRate}%)
      <input type="number" min="0" step="0.01" value={input}
        onChange={(event) => { setInput(event.target.value); setError(null); }}
        aria-label={`Inclusive MRP ${line.productName}`}
        className="mt-1 h-8 w-full rounded border border-slate-200 px-2 text-sm"/>
    </label>
    <p className="text-xs text-slate-600">
      MRP is per unit before item discount. The converted rate is tax-exclusive;
      rounding may make the final inclusive unit price a little lower than MRP.
    </p>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => {
        try {
          if (!input.trim()) throw new Error("Enter an inclusive MRP");
          onApply(quoteInclusiveMrpUnitPrice(Number(input), taxRate));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Invalid MRP");
        }
      }}>Apply MRP</Button>
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
