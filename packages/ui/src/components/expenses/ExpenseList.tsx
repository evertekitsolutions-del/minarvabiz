"use client";

import * as React from "react";
import type { Expense, Purchase, ExpenseCategory, ServiceOrder, Supplier } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

export function ExpenseList({
  expenses,
  categories = [],
  orders: _orders,
  onAdd,
  onCreate,
  onReverse,
}: {
  expenses: Expense[];
  categories?: ExpenseCategory[];
  orders?: ServiceOrder[];
  onAdd?: () => void;
  onCreate?: () => void;
  onReverse?: (expense: Expense, reason: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [reverseTarget, setReverseTarget] = React.useState<Expense | null>(null);
  const [reverseReason, setReverseReason] = React.useState("");

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (categoryId && expense.categoryId !== categoryId) return false;
      if (paymentMethod && expense.paymentMethod !== paymentMethod) return false;
      const key = dateKey(expense.date);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      if (!normalized) return true;
      return [
        expense.categoryName || "",
        expense.description || "",
        expense.orderNumber || "",
        expense.reference || "",
        expense.paymentMethod,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [expenses, categoryId, paymentMethod, dateFrom, dateTo, query]);

  const clearFilters = () => {
    setQuery("");
    setCategoryId("");
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
  };

  const columns: Column<Expense>[] = [
    { key: "date", header: "Date", render: (r) => new Date(r.date).toLocaleDateString("en-IN") },
    { key: "categoryName", header: "Category", render: (r) => r.categoryName || "—" },
    { key: "description", header: "Description", render: (r) => r.description || "—" },
    { key: "orderNumber", header: "Order", render: (r) => r.orderNumber ? <span className="text-indigo-600">{r.orderNumber}</span> : <span className="text-slate-400">General</span> },
    { key: "amount", header: "Amount", render: (r) => <span className="font-medium">{formatMoney(r.amount)}</span> },
    { key: "paymentMethod", header: "Method", render: (r) => r.paymentMethod },
    {
      key: "action",
      header: "Action",
      render: (r) => onReverse
        ? <Button size="sm" variant="outline" onClick={() => { setReverseTarget(r); setReverseReason(""); }}>Reverse</Button>
        : <span className="text-xs text-slate-400">—</span>,
    },
  ];

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Expenses</h2>
            <p className="text-sm text-slate-500">{filtered.length} of {expenses.length} records</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
            <Button onClick={onAdd ?? onCreate}>+ Add Expense</Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search description, reference or order
            <input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Category
            <select className={selectClass + " mt-1"} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Payment method
            <select className={selectClass + " mt-1"} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">All methods</option>
              {["cash", "bank", "card", "upi", "online", "other"].map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-600">
              From
              <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              To
              <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>

        <DataTable columns={columns} rows={filtered} emptyMessage="No expenses match the selected filters" />
      </div>

      <Modal
        open={Boolean(reverseTarget)}
        title={reverseTarget ? `Reverse expense · ${formatMoney(reverseTarget.amount)}` : "Reverse expense"}
        onClose={() => { setReverseTarget(null); setReverseReason(""); }}
        footer={<>
          <Button variant="outline" onClick={() => { setReverseTarget(null); setReverseReason(""); }}>Keep expense</Button>
          <Button
            disabled={!reverseTarget || reverseReason.trim().length < 3}
            onClick={() => {
              if (!reverseTarget || !onReverse) return;
              onReverse(reverseTarget, reverseReason.trim());
              setReverseTarget(null);
              setReverseReason("");
            }}
          >
            Confirm reversal
          </Button>
        </>}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Reversal posts the accounting inverse, rolls back any linked order expense and preserves the source in the audit trail. It is not a hard delete.
          </div>
          <FormField label="Reversal reason *">
            <textarea
              className={inputClass + " h-24 py-2"}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Why is this expense being reversed?"
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}

export function PurchaseList({ purchases, suppliers = [], onAdd, onCreate }: { purchases: Purchase[]; suppliers?: Supplier[]; onAdd?: () => void; onCreate?: () => void }) {
  const [query, setQuery] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [outstandingOnly, setOutstandingOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (supplierId === "__none" && purchase.supplierId) return false;
      if (supplierId && supplierId !== "__none" && purchase.supplierId !== supplierId) return false;
      if (kind && purchase.kind !== kind) return false;
      if (paymentMethod && purchase.paymentMethod !== paymentMethod) return false;
      if (outstandingOnly && purchase.balanceAmount <= 0) return false;
      const key = dateKey(purchase.date);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      if (!normalized) return true;
      return [
        purchase.purchaseNumber,
        purchase.supplierName || "",
        purchase.description,
        purchase.orderNumber || "",
        purchase.notes || "",
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [purchases, supplierId, kind, paymentMethod, outstandingOnly, dateFrom, dateTo, query]);

  const clearFilters = () => {
    setQuery("");
    setSupplierId("");
    setKind("");
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
    setOutstandingOnly(false);
  };

  const columns: Column<Purchase>[] = [
    { key: "purchaseNumber", header: "Purchase #", render: (r) => <span className="font-medium">{r.purchaseNumber}</span> },
    { key: "date", header: "Date", render: (r) => new Date(r.date).toLocaleDateString("en-IN") },
    { key: "description", header: "Description" },
    { key: "kind", header: "Kind", render: (r) => <span className={r.kind === "order_specific" ? "text-violet-700" : "text-slate-600"}>{r.kind === "order_specific" ? `Order ${r.orderNumber}` : "General"}</span> },
    { key: "supplierName", header: "Supplier", render: (r) => r.supplierName || "Direct / no supplier" },
    { key: "amount", header: "Amount", render: (r) => formatMoney(r.amount) },
    { key: "paymentMethod", header: "Method", render: (r) => r.paymentMethod },
    { key: "balanceAmount", header: "Balance", render: (r) => <span className={r.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>{formatMoney(r.balanceAmount)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Purchases</h2>
          <p className="text-sm text-slate-500">{filtered.length} of {purchases.length} records</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
          <Button onClick={onAdd ?? onCreate}>+ Add Purchase</Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Search purchase, supplier, description or order
          <input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Direct purchase supplier filter
          <select className={selectClass + " mt-1"} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">All suppliers</option>
            <option value="__none">Direct / no supplier</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Kind
          <select className={selectClass + " mt-1"} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            <option value="general">General</option>
            <option value="order_specific">Order-specific</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Payment method
          <select className={selectClass + " mt-1"} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">All methods</option>
            {["cash", "bank", "card", "upi", "online", "other"].map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} />
          Outstanding only
        </label>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </div>

      <DataTable columns={columns} rows={filtered} emptyMessage="No purchases match the selected filters" />
    </div>
  );
}
