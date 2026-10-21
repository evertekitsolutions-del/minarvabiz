"use client";

import * as React from "react";
import type { Customer } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "./format";
import { hasOutstandingCustomerBalance } from "./customer-dues-filter";
import { listAuthorizedCustomerSegments, CUSTOMER_SEGMENT_LABELS, type CustomerSegment } from "@minarvabiz/business-logic";

export function CustomerList({
  customers,
  onAdd,
  onSearch,
  onSelect,
  onEdit,
  onArchive,
  onCollect,
  onSetOpeningBalance,
}: {
  customers: Customer[];
  onAdd?: () => void;
  onSearch?: (q: string) => void;
  onSelect?: (c: Customer) => void;
  onEdit?: (c: Customer) => void;
  onArchive?: (c: Customer) => void;
  onCollect?: (c: Customer) => void;
  onSetOpeningBalance?: (c: Customer) => void;
}) {
  const [q, setQ] = React.useState("");
  const [withDuesOnly, setWithDuesOnly] = React.useState(false);
  const [segmentFilter, setSegmentFilter] = React.useState<CustomerSegment | "all">("all");
  const segments = React.useMemo(() => {
    try {
      return new Map(listAuthorizedCustomerSegments().map(row => [row.customerId, row] as const));
    } catch {
      return new Map<string, ReturnType<typeof listAuthorizedCustomerSegments>[number]>();
    }
  }, [customers]);
  const segmentOptions: CustomerSegment[] = [
    "champion","loyal","promising","new","at_risk","lost","hibernating",
  ];
  const visibleCustomers = React.useMemo(() => {
    const byDues = withDuesOnly
      ? customers.filter(hasOutstandingCustomerBalance) : customers;
    return segmentFilter === "all" ? byDues : byDues.filter(customer =>
      segments.get(customer.id)?.segment === segmentFilter);
  }, [customers, withDuesOnly, segmentFilter, segments]);
  const columns: Column<Customer>[] = [
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
          {onCollect && hasOutstandingCustomerBalance(r) && <Button size="sm" variant="outline" onClick={() => onCollect(r)}>Collect Payment</Button>}
          {onSetOpeningBalance && <Button size="sm" variant="outline" onClick={() => onSetOpeningBalance(r)}>Opening balance</Button>}
          {onEdit && <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>}
          {onArchive && <Button size="sm" variant="outline" onClick={() => onArchive(r)}>Delete / Archive</Button>}
        </div>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          {r.phone && <div className="text-xs text-slate-500">{r.phone}</div>}
        </div>
      ),
    },
    {
      key: "segment",
      header: "Segment",
      render: (r) => {
        const segment = segments.get(r.id);
        if (!segment) return "—";
        return <span className="text-xs font-medium text-slate-700" title={segment.churnRisk + " churn risk"}>
          {CUSTOMER_SEGMENT_LABELS[segment.segment]}
        </span>;
      },
    },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    {
      key: "totalSpending",
      header: "Total Spending",
      render: (r) => formatMoney(r.totalSpending),
    },
    {
      key: "outstandingBalance",
      header: "Outstanding",
      render: (r) => (
        <span className={r.outstandingBalance > 0 ? "font-medium text-rose-600" : "text-slate-500"}>
          {formatMoney(r.outstandingBalance)}
        </span>
      ),
    },

  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Customers</h2>
          <p role="status" className="text-sm text-slate-500">{visibleCustomers.length} of {customers.length} customers</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search name, phone, email…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm sm:w-64 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <Button onClick={onAdd}>+ Add Customer</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={withDuesOnly} onChange={(event) => setWithDuesOnly(event.target.checked)} />
          Outstanding balance only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Customer segment
          <select
            className="h-9 rounded border border-slate-200 bg-white px-2 text-sm"
            aria-label="Customer segment"
            value={segmentFilter}
            onChange={(event) => setSegmentFilter(event.target.value as CustomerSegment | "all")}
          >
            <option value="all">All segments</option>
            {segmentOptions.map(segment => (
              <option key={segment} value={segment}>{CUSTOMER_SEGMENT_LABELS[segment]}</option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => { setQ(""); setWithDuesOnly(false); setSegmentFilter("all"); onSearch?.(""); }}>Clear filters</Button>
      </div>
      <DataTable columns={columns} rows={visibleCustomers} onRowClick={onSelect} emptyMessage={withDuesOnly ? "No customers with outstanding balances match this search" : "No customers match this search"} />
    </div>
  );
}
