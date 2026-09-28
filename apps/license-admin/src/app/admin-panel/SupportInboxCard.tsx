"use client";

import * as React from "react";
import { Button } from "@minarvabiz/ui";
import type { SupportRequestRow, SupportRequestStatus } from "./types";

const STATUS_OPTIONS: Array<{ value: SupportRequestStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "planned", label: "Planned" },
  { value: "resolved", label: "Resolved" },
  { value: "duplicate", label: "Duplicate" },
  { value: "rejected", label: "Rejected" },
];

function labelType(value: SupportRequestRow["request_type"]) {
  if (value === "technical_escalation") return "Technical escalation";
  if (value === "feature_request") return "Feature request";
  if (value === "suggestion") return "Suggestion";
  return "Bug report";
}

function badgeClass(value: string) {
  if (value === "urgent" || value === "new") return "bg-rose-50 text-rose-700 border-rose-200";
  if (value === "high" || value === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (value === "planned") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (value === "resolved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function SupportInboxCard({
  requests,
  busy,
  canManage,
  onUpdate,
}: {
  requests: SupportRequestRow[];
  busy: boolean;
  canManage: boolean;
  onUpdate: (input: { id: string; status: SupportRequestStatus; assignedTo: string; adminNotes: string }) => void;
}) {
  const [filter, setFilter] = React.useState<"open" | "all" | SupportRequestRow["request_type"]>("open");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, { status: SupportRequestStatus; assignedTo: string; adminNotes: string }>>({});

  React.useEffect(() => {
    const next: typeof drafts = {};
    for (const request of requests) {
      next[request.id] = {
        status: request.status,
        assignedTo: request.assigned_to || "",
        adminNotes: request.admin_notes || "",
      };
    }
    setDrafts(next);
  }, [requests]);

  const visible = React.useMemo(() => {
    if (filter === "all") return requests;
    if (filter === "open") return requests.filter((item) => !["resolved", "rejected", "duplicate"].includes(item.status));
    return requests.filter((item) => item.request_type === filter);
  }, [filter, requests]);

  const counts = React.useMemo(() => ({
    open: requests.filter((item) => !["resolved", "rejected", "duplicate"].includes(item.status)).length,
    technical: requests.filter((item) => item.request_type === "technical_escalation" || item.request_type === "bug").length,
    ideas: requests.filter((item) => item.request_type === "feature_request" || item.request_type === "suggestion").length,
  }), [requests]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Customer Voice</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Support Inbox</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            AI escalations, feature requests and workflow suggestions submitted from Minarva Biz.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-lg font-bold text-slate-900">{counts.open}</div><div className="text-slate-500">Open</div></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-lg font-bold text-slate-900">{counts.technical}</div><div className="text-slate-500">Technical</div></div>
          <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-lg font-bold text-slate-900">{counts.ideas}</div><div className="text-slate-500">Ideas</div></div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {[
          ["open", "Open"],
          ["technical_escalation", "AI escalations"],
          ["bug", "Bugs"],
          ["feature_request", "Features"],
          ["suggestion", "Suggestions"],
          ["all", "All"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as typeof filter)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((request) => {
          const open = expanded === request.id;
          const draft = drafts[request.id] || {
            status: request.status,
            assignedTo: request.assigned_to || "",
            adminNotes: request.admin_notes || "",
          };
          return (
            <article key={request.id} className="rounded-xl border border-slate-200 bg-slate-50/60">
              <button
                type="button"
                className="flex w-full flex-col gap-3 p-4 text-left md:flex-row md:items-start md:justify-between"
                onClick={() => setExpanded(open ? null : request.id)}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(request.status)}`}>{request.status.replace("_", " ")}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(request.priority)}`}>{request.priority}</span>
                    <span className="text-xs font-medium text-slate-500">{labelType(request.request_type)}</span>
                  </div>
                  <h3 className="mt-2 truncate text-sm font-semibold text-slate-900">{request.title}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{request.organization_name || "Unknown organization"}</span>
                    <span>v{request.app_version || "?"}</span>
                    <span>{request.module || "Unspecified module"}</span>
                    <span>{fmtDate(request.created_at)}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-700">{open ? "Hide" : "Review"}</span>
              </button>

              {open && (
                <div className="border-t border-slate-200 bg-white p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer request</div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{request.description}</p>
                      {request.contact_email && <p className="mt-3 text-xs text-slate-500">Contact: <span className="font-medium text-slate-700">{request.contact_email}</span></p>}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                        <div>Edition: <span className="font-medium text-slate-700">{request.edition || "—"}</span></div>
                        <div>Platform: <span className="font-medium text-slate-700">{request.platform || "—"}</span></div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI triage</div>
                      <div className="mt-2 min-h-20 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm leading-6 text-indigo-950">
                        {request.ai_summary || "No AI triage summary was generated."}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(request.transcript) && request.transcript.length > 0 && (
                    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">AI chat transcript ({request.transcript.length} messages)</summary>
                      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                        {request.transcript.map((message, index) => (
                          <div key={index} className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-700">
                            <span className="font-semibold">{message.role === "assistant" ? "AI" : "Customer"}:</span>{" "}
                            {message.content || ""}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="text-xs font-medium text-slate-600">
                      Status
                      <select
                        disabled={!canManage}
                        value={draft.status}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [request.id]: { ...draft, status: event.target.value as SupportRequestStatus },
                        }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
                      >
                        {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Assigned to
                      <input
                        disabled={!canManage}
                        value={draft.assignedTo}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [request.id]: { ...draft, assignedTo: event.target.value },
                        }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
                        placeholder="Admin email / owner"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-slate-600">
                    Internal notes
                    <textarea
                      disabled={!canManage}
                      value={draft.adminNotes}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [request.id]: { ...draft, adminNotes: event.target.value },
                      }))}
                      className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      placeholder="Decision, follow-up, implementation notes…"
                    />
                  </label>
                  {canManage && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        disabled={busy}
                        onClick={() => onUpdate({ id: request.id, status: draft.status, assignedTo: draft.assignedTo, adminNotes: draft.adminNotes })}
                      >
                        Save Support Update
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!visible.length && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No support requests match this filter.
          </div>
        )}
      </div>
    </section>
  );
}
