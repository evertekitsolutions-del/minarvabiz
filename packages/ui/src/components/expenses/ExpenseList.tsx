"use client";

import * as React from "react";
import type { Expense, Purchase } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";

export function ExpenseList({
  expenses,
  onAdd,
}: {
  expenses: Expense[];
  onAdd?: () => void;
}) {
  const columns: Column<Expense>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => new Date(r.date).toLocaleDateString("en-IN"),
    },
    { key: "categoryName", header: "Category", render: (r) => r.categoryName || "—" },
    { key: "description", header: "Description", render: (r) => r.description || "—" },
    {
      key: "orderNumber",
      header: "Order",
      render: (r) => r.orderNumber ? (
        <span className="text-indigo-600">{r.orderNumber}</span>
      ) : (
        <span className="text-slate-400">General</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => <span className="font-medium">{formatMoney(r.amount)}</span>,
    },
    { key: "paymentMethod", header: "Method", render: (r) => r.paymentMethod },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Expenses</h2>
          <p className="text-sm text-slate-500">{expenses.length} records</p>
        </div>
        <Button onClick={onAdd}>+ Add Expense</Button>
      </div>
      <DataTable columns={columns} rows={expenses} emptyMessage="No expenses yet" />
    </div>
  );
}

export function PurchaseList({
  purchases,
  onAdd,
}: {
  purchases: Purchase[];
  onAdd?: () => void;
}) {
  const columns: Column<Purchase>[] = [
    { key: "purchaseNumber", header: "Purchase #", render: (r) => <span className="font-medium">{r.purchaseNumber}</span> },
    {
      key: "date",
      header: "Date",
      render: (r) => new Date(r.date).toLocaleDateString("en-IN"),
    },
    { key: "description", header: "Description" },
    {
      key: "kind",
      header: "Kind",
      render: (r) => (
        <span className={r.kind === "order_specific" ? "text-violet-700" : "text-slate-600"}>
          {r.kind === "order_specific" ? `Order ${r.orderNumber}` : "General"}
        </span>
      ),
    },
    { key: "supplierName", header: "Supplier", render: (r) => r.supplierName || "—" },
    {
      key: "amount",
      header: "Amount",
      render: (r) => formatMoney(r.amount),
    },
    {
      key: "balanceAmount",
      header: "Balance",
      render: (r) => (
        <span className={r.balanceAmount > 0 ? "text-rose-600" : "text-slate-500"}>
          {formatMoney(r.balanceAmount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Purchases</h2>
          <p className="text-sm text-slate-500">{purchases.length} records</p>
        </div>
        <Button onClick={onAdd}>+ Add Purchase</Button>
      </div>
      <DataTable columns={columns} rows={purchases} emptyMessage="No purchases yet" />
    </div>
  );
}
