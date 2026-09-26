"use client";

import * as React from "react";
import type { AuditLogEntry } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { inputClass, selectClass } from "../forms/FormField";

function localDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function prettyJson(value?: string | null): string {
  if (!value) return "—";
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value; }
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function AuditLogList({ logs }: { logs: AuditLogEntry[] }) {
  const [query, setQuery] = React.useState("");
  const [action, setAction] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);

  const actions = React.useMemo(() => [...new Set(logs.map((log) => log.action).filter(Boolean))].sort(), [logs]);
  const entities = React.useMemo(() => [...new Set(logs.map((log) => log.tableName).filter((value): value is string => Boolean(value)))].sort(), [logs]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (action && log.action !== action) return false;
      if (entity && log.tableName !== entity) return false;
      const key = localDateKey(log.createdAt);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      if (!q) return true;
      return [
        log.userName || "",
        log.action,
        log.tableName || "",
        log.recordId || "",
        log.oldValue || "",
        log.newValue || "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [logs, action, entity, dateFrom, dateTo, query]);

  const columns: Column<AuditLogEntry>[] = [
    { key: "createdAt", header: "When", render: (r) => new Date(r.createdAt).toLocaleString("en-IN") },
    { key: "userName", header: "Actor", render: (r) => r.userName || "System" },
    { key: "action", header: "Action", render: (r) => <span className="font-medium text-slate-900">{r.action}</span> },
    { key: "tableName", header: "Entity", render: (r) => r.tableName || "—" },
    { key: "recordId", header: "Record", render: (r) => (r.recordId ? r.recordId.slice(0, 10) + "…" : "—") },
    { key: "id", header: "Details", render: (r) => <Button size="sm" variant="outline" onClick={() => setSelected(r)}>View</Button> },
  ];

  const clearFilters = () => {
    setQuery("");
    setAction("");
    setEntity("");
    setDateFrom("");
    setDateTo("");
  };

  const exportCsv = () => {
    const header = ["Timestamp", "Actor", "Action", "Entity", "Record ID", "Before", "After", "IP Address"];
    const rows = filtered.map((log) => [
      log.createdAt, log.userName || "System", log.action, log.tableName || "", log.recordId || "",
      log.oldValue || "", log.newValue || "", log.ipAddress || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `minarva-biz-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Audit Log</h2>
            <p className="text-sm text-slate-500">Immutable action history · {filtered.length} of {logs.length} entries</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
            <Button size="sm" variant="outline" disabled={!filtered.length} onClick={exportCsv}>Export CSV</Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            Search actor, action, entity or record
            <input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Action
            <select className={selectClass + " mt-1"} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Entity
            <select className={selectClass + " mt-1"} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">All entities</option>
              {entities.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            From
            <input type="date" className={inputClass + " mt-1"} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            To
            <input type="date" className={inputClass + " mt-1"} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        <DataTable columns={columns} rows={filtered} onRowClick={setSelected} emptyMessage="No audit entries match the selected filters" />
      </div>

      <Modal
        open={Boolean(selected)}
        title={selected ? `Audit detail · ${selected.action}` : "Audit detail"}
        onClose={() => setSelected(null)}
        footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}
        className="max-w-4xl"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs text-slate-500">Timestamp</div><div className="font-medium text-slate-900">{new Date(selected.createdAt).toLocaleString("en-IN")}</div></div>
              <div><div className="text-xs text-slate-500">Actor</div><div className="font-medium text-slate-900">{selected.userName || "System"}</div></div>
              <div><div className="text-xs text-slate-500">Entity</div><div className="font-medium text-slate-900">{selected.tableName || "—"}</div></div>
              <div><div className="text-xs text-slate-500">Record ID</div><div className="break-all font-mono text-xs text-slate-700">{selected.recordId || "—"}</div></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section><h3 className="mb-2 font-semibold text-slate-900">Before</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">{prettyJson(selected.oldValue)}</pre></section>
              <section><h3 className="mb-2 font-semibold text-slate-900">After</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">{prettyJson(selected.newValue)}</pre></section>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
