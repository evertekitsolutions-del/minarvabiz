"use client";

import * as React from "react";

/**
 * Shared read-only branch-local calendar presentation for Web and Windows.
 * Inputs come from the existing authorized roster snapshot, never from a new
 * fetcher or a second scheduling engine. This component cannot save/replay.
 */
export interface RosterCalendarEntry {
  id: string;
  workDate: string; // branch-local YYYY-MM-DD; never parse as client-local midnight
  employee: string;
  shift: string;
  hours: string;
  branch: string;
  version: number;
}

export interface RosterMonthCalendarProps {
  month: string;
  entries: readonly RosterCalendarEntry[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday-first ISO date-only grid. UTC arithmetic avoids device timezone drift. */
export function rosterMonthCells(month: string): (string | null)[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  if (year < 1900 || year > 9999) return [];
  const firstDay = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells: (string | null)[] = Array(firstDay).fill(null);
  for (let day = 1; day <= days; day++) {
    cells.push(month + "-" + String(day).padStart(2, "0"));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function RosterMonthCalendar({ month, entries }: RosterMonthCalendarProps) {
  const cells = rosterMonthCells(month);
  if (!cells.length) return <p role="status">Select a valid planning month to view the roster calendar.</p>;
  const grouped = new Map<string, RosterCalendarEntry[]>();
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.workDate) || entry.workDate.slice(0, 7) !== month) continue;
    const group = grouped.get(entry.workDate) ?? [];
    group.push(entry);
    grouped.set(entry.workDate, group);
  }
  for (const group of grouped.values()) group.sort((a, b) =>
    a.employee.localeCompare(b.employee) || a.id.localeCompare(b.id));
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return <div className="space-y-2" aria-label="Read-only monthly roster calendar">
    <p className="text-sm text-slate-600">
      Scheduled assignments only. Cancelled entries and revision actions remain available in List view.
      Dates are branch-local; no timezone conversion, approval, payroll calculation or write occurs here.
    </p>
    <div className="overflow-x-auto">
      <table aria-label={`Monthly roster ${month}`} className="w-full min-w-[700px] border-collapse text-left text-xs">
        <thead><tr>{WEEKDAYS.map(day =>
          <th key={day} scope="col" className="border bg-slate-50 p-2 font-semibold">{day}</th>,
        )}</tr></thead>
        <tbody>{weeks.map((week, index) => <tr key={index}>
          {week.map((date, column) =>
            date
              ? <td key={date} className="h-24 w-[14.28%] align-top border p-2">
                  <time dateTime={date} className="block font-semibold">{Number(date.slice(-2))}</time>
                  <ul className="mt-1 space-y-1">{(grouped.get(date) ?? []).map(event =>
                    <li key={event.id} className="rounded bg-slate-100 p-1" title={event.branch}>
                      <span className="block font-semibold">{event.employee}</span>
                      <span className="block">{event.shift} · {event.hours}</span>
                      <span className="block text-slate-600">{event.branch} · v{event.version}</span>
                    </li>,
                  )}</ul>
                </td>
              : <td key={`empty-${index}-${column}`} className="border bg-slate-50" aria-label="Outside selected month" />,
          )}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-sm text-slate-500">{entries.filter(e => e.workDate.slice(0, 7) === month).length} scheduled assignments in the selected view.</p>
  </div>;
}
