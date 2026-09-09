"use client";

import * as React from "react";
import { globalSearch, type SearchResult } from "@minarvabiz/business-logic";
import type { NavItemId } from "../../lib/nav";

export interface GlobalSearchPaletteProps {
  query: string;
  onClose: () => void;
  onNavigate?: (href: string, id: NavItemId) => void;
}

const NAV_BY_KIND: Record<SearchResult["kind"], NavItemId> = {
  customer: "customers",
  sale: "sales",
  order: "services",
  product: "sales",
  quotation: "sales",
  payment: "sales",
  staff: "staff",
};

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  customer: "Customer",
  sale: "Invoice",
  order: "Order",
  product: "Product",
  quotation: "Quotation",
  payment: "Payment",
  staff: "Staff",
};

export function GlobalSearchPalette({ query, onClose, onNavigate }: GlobalSearchPaletteProps) {
  const value = query.trim();
  const results = React.useMemo(() => globalSearch(value, 12), [value]);
  if (!value) return null;

  return (
    <div
      className="fixed left-1/2 top-16 z-[90] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      role="listbox"
      aria-label="Global search results"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>{results.length ? `${results.length} results` : "No matching records"}</span>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 hover:bg-slate-100">Esc</button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {results.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No customers, invoices, orders, products, payments or staff matched.</div>
        ) : (
          results.map((item) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-indigo-50"
              onClick={() => { onNavigate?.(item.href, NAV_BY_KIND[item.kind]); onClose(); }}
              role="option"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{item.title.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">{item.title}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{KIND_LABEL[item.kind]}</span>
                </span>
                <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">Open →</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
