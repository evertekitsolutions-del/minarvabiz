"use client";

import * as React from "react";
import { cn } from "../../lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "No records found",
  onRowClick,
  className,
  pagination = true,
  initialPageSize = 25,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  pagination?: boolean;
  initialPageSize?: number;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / Math.max(1, pageSize)));
  const safePage = Math.min(page, totalPages);
  const visibleRows = pagination
    ? rows.slice((safePage - 1) * pageSize, safePage * pageSize)
    : rows;

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((col) => (
              <th key={col.key} className={cn("px-4 py-3 font-medium", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {visibleRows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "text-slate-700 transition-colors",
                onRowClick && "cursor-pointer hover:bg-slate-50"
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3", col.className)}>
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {pagination && rows.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Showing {Math.min((safePage - 1) * pageSize + 1, rows.length)}–{Math.min(safePage * pageSize, rows.length)} of {rows.length}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select
                className="h-8 rounded-md border border-slate-200 bg-white px-2"
                value={pageSize}
                onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || initialPageSize))}
              >
                {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" className="h-8 rounded-md border border-slate-200 bg-white px-3 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span>Page {safePage} / {totalPages}</span>
            <button type="button" className="h-8 rounded-md border border-slate-200 bg-white px-3 disabled:opacity-40" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
