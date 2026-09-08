"use client";

import * as React from "react";
import type { NavItemId } from "../../lib/nav";

export interface CommandPaletteProps {
  activeNav?: NavItemId;
  onNavigate?: (href: string, id: NavItemId) => void;
}

interface CommandItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
  href: string;
  navId: NavItemId;
  shortcut?: string;
}

const commands: CommandItem[] = [
  { id: "new-sale", label: "New Sale", description: "Open POS billing", keywords: "sale billing invoice pos", href: "/sales", navId: "sales", shortcut: "N S" },
  { id: "new-order", label: "New Order", description: "Open tailoring/service orders", keywords: "order tailoring service", href: "/services", navId: "services", shortcut: "N O" },
  { id: "customers", label: "Customers", description: "Manage customer records", keywords: "customer client crm", href: "/customers", navId: "customers" },
  { id: "products", label: "Products & Inventory", description: "Manage products and stock", keywords: "products inventory stock barcode", href: "/products", navId: "products" },
  { id: "sales", label: "Sales & Billing", description: "Sales history and POS", keywords: "sales invoices billing", href: "/sales", navId: "sales" },
  { id: "services", label: "Services & Orders", description: "Tailoring and service workflow", keywords: "services orders tailoring measurements", href: "/services", navId: "services" },
  { id: "laundry", label: "Laundry & Ironing", description: "Laundry tickets and ironing", keywords: "laundry ironing outsourced", href: "/laundry", navId: "laundry" },
  { id: "expenses", label: "Expenses", description: "Review operating expenses", keywords: "expenses costs spending", href: "/expenses", navId: "expenses" },
  { id: "purchases", label: "Purchases", description: "Review purchases and suppliers", keywords: "purchases suppliers procurement", href: "/purchases", navId: "purchases" },
  { id: "staff", label: "Staff Management", description: "Manage staff and payroll data", keywords: "staff employees salary", href: "/staff", navId: "staff" },
  { id: "reports", label: "Reports & Analytics", description: "Open business reports", keywords: "reports analytics profit day end", href: "/reports", navId: "reports" },
  { id: "notifications", label: "Notifications", description: "Review customer notifications", keywords: "notifications sms whatsapp messages", href: "/notifications", navId: "notifications" },
  { id: "settings", label: "Settings", description: "Configure Minarva Biz", keywords: "settings configuration tax shop", href: "/settings", navId: "settings" },
  { id: "backup", label: "Backup & Restore", description: "Protect and restore your SQLite data", keywords: "backup restore database sqlite", href: "/backup", navId: "backup" },
  { id: "dashboard", label: "Dashboard", description: "Return to the business command center", keywords: "dashboard home overview", href: "/dashboard", navId: "dashboard" },
];

export function CommandPalette({ activeNav, onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(q));
  }, [query]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((current) => Math.max(current - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[selected];
        if (item) {
          onNavigate?.(item.href, item.navId);
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, onNavigate, open, selected]);

  React.useEffect(() => {
    if (!open) return;
    setSelected(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(filtered.length - 1, 0));
  }, [filtered.length, selected]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-30 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-lg backdrop-blur sm:flex"
        aria-label="Open command palette"
      >
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">⌘K</span>
        <span className="sm:hidden">Commands</span>
        <span className="hidden sm:inline">Quick commands</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Minarva Biz command palette">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <svg className="h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} placeholder="Search modules and commands…" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500">Esc</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No commands match “{query}”.</div>
          ) : (
            filtered.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setSelected(index)}
                onClick={() => { onNavigate?.(item.href, item.navId); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index === selected ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}
                aria-current={activeNav === item.navId ? "page" : undefined}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${index === selected ? "bg-white text-indigo-600 shadow-sm" : "bg-slate-100 text-slate-500"}`}>{item.label.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className="block truncate text-xs text-slate-500">{item.description}</span>
                </span>
                {item.shortcut && <span className="hidden rounded-md bg-white px-2 py-1 text-[10px] font-mono text-slate-400 shadow-sm sm:inline">{item.shortcut}</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400"><span>↑↓ navigate · Enter open</span><span>Ctrl/Cmd + K</span></div>
      </div>
    </div>
  );
}
