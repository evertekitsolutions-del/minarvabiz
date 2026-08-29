"use client";

import * as React from "react";
import type { AuditLogEntry } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";

export function AuditLogList({ logs }: { logs: AuditLogEntry[] }) {
  const columns: Column<AuditLogEntry>[] = [
    {
      key: "createdAt",
      header: "When",
      render: (r) => new Date(r.createdAt).toLocaleString("en-IN"),
    },
    { key: "userName", header: "User", render: (r) => r.userName || "—" },
    { key: "action", header: "Action", render: (r) => <span className="font-medium">{r.action}</span> },
    { key: "tableName", header: "Table", render: (r) => r.tableName || "—" },
    {
      key: "recordId",
      header: "Record",
      render: (r) => (r.recordId ? r.recordId.slice(0, 8) + "…" : "—"),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Audit log</h2>
        <p className="text-sm text-slate-500">Immutable action history</p>
      </div>
      <DataTable columns={columns} rows={logs} emptyMessage="No audit entries yet" />
    </div>
  );
}
