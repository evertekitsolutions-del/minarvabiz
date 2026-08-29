"use client";

import * as React from "react";
import type { StaffMember } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";

export function StaffList({
  staff,
  onAdd,
  onSelect,
}: {
  staff: StaffMember[];
  onAdd?: () => void;
  onSelect?: (s: StaffMember) => void;
}) {
  const columns: Column<StaffMember>[] = [
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
      key: "role",
      header: "Role",
      render: (r) => <span className="capitalize">{r.role.replace("_", " ")}</span>,
    },
    {
      key: "salary",
      header: "Salary",
      render: (r) => formatMoney(r.salary),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span
          className={
            r.status === "active"
              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
          }
        >
          {r.status}
        </span>
      ),
    },
    {
      key: "joiningDate",
      header: "Joined",
      render: (r) =>
        r.joiningDate ? new Date(r.joiningDate).toLocaleDateString("en-IN") : "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Staff Management</h2>
          <p className="text-sm text-slate-500">{staff.length} members</p>
        </div>
        <Button onClick={onAdd}>+ Add Staff</Button>
      </div>
      <DataTable columns={columns} rows={staff} onRowClick={onSelect} emptyMessage="No staff yet" />
    </div>
  );
}
