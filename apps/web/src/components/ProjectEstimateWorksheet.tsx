"use client";

import * as React from "react";
import {
  calculateProjectEstimate,
  exportProjectEstimateCsv,
  type ProjectEstimateInput,
  type ProjectEstimateLine,
  type ProjectEstimateScope,
} from "@minarvabiz/business-logic";

/** Host owns authenticated scope, durable storage and audit. Never infer permissions in the browser. */
export interface ProjectEstimateWorksheetProps {
  scope: ProjectEstimateScope;
  load: () => Promise<ProjectEstimateInput | null>;
  save: (worksheet: ProjectEstimateInput, idempotencyKey: string) => Promise<void>;
  enabled: boolean;
  /** Server-authorized edit permission; read-only users may still inspect estimates. */
  canEdit?: boolean;
  /** Explicit host-authorized export; the host must check download permissions. */
  canExport?: boolean;
}

const newLine = (): ProjectEstimateLine => ({
  id: crypto.randomUUID(), description: "", kind: "labor", quantity: "1",
  unitCost: "0.00", markupPercent: "0",
});

export function ProjectEstimateWorksheet({ scope, load, save, enabled, canExport = false, canEdit = false }: ProjectEstimateWorksheetProps) {
  const [worksheet, setWorksheet] = React.useState<ProjectEstimateInput | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [requestKey, setRequestKey] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    setWorksheet(null);
    setError("");
    if (!enabled || !scope.canViewCosts) return;
    setBusy(true);
    load().then(row => {
      if (active) setWorksheet(row ?? {
        tenantId: scope.tenantId, companyId: scope.companyId, branchId: scope.branchId,
        projectId: scope.projectId, currency: "INR", revision: 0, lines: [newLine()],
      });
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Load failed"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [enabled, scope.tenantId, scope.companyId, scope.branchId, scope.projectId, scope.canViewCosts, load]);

  const updateLine = (id: string, patch: Partial<ProjectEstimateLine>) => {
    setWorksheet(previous => previous && ({
      ...previous, lines: previous.lines.map(line => line.id === id ? { ...line, ...patch } : line),
    }));
    setRequestKey(null);
    setMessage("");
  };
  const totals = React.useMemo(() => {
    if (!worksheet) return null;
    try { return calculateProjectEstimate(worksheet, scope); } catch { return null; }
  }, [worksheet, scope]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !worksheet || !totals || busy) return;
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    setBusy(true);
    setError("");
    try {
      await save(worksheet, key);
      // Never assume the adapter's acknowledgement contains the next authoritative revision.
      const current = await load();
      if (!current) throw new Error("Saved estimate could not be reloaded");
      setWorksheet(current);
      setRequestKey(null);
      setMessage("Estimate saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  function downloadCsv() {
    if (!canExport || !worksheet || !totals || busy) return;
    try {
      const csv = exportProjectEstimateCsv(worksheet, scope);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `project-estimate-${worksheet.projectId.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Export failed"); }
  }

  if (!enabled || !scope.canViewCosts) return null;
  return (
    <form onSubmit={submit} aria-label="Project estimate worksheet" className="space-y-3">
      <h2 className="text-lg font-semibold">Project estimate</h2>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status">{message}</p>}
      {worksheet && <>
        <label>Currency <input aria-label="Currency" value={worksheet.currency} maxLength={3} disabled={!canEdit || busy}
          onChange={e => { setWorksheet({ ...worksheet, currency: e.target.value.toUpperCase() }); setRequestKey(null); }} /></label>
        {worksheet.lines.map(line => (
          <fieldset key={line.id} className="grid gap-2 rounded border p-3">
            <legend>Estimate line</legend>
            <label>Description <input required value={line.description} maxLength={500}
              disabled={!canEdit || busy} onChange={e => updateLine(line.id, { description: e.target.value })} /></label>
            <label>Type <select value={line.kind} disabled={!canEdit || busy} onChange={e => updateLine(line.id, { kind: e.target.value as ProjectEstimateLine["kind"] })}>
              <option value="labor">Labor</option><option value="material">Material</option><option value="expense">Expense</option>
            </select></label>
            {(["quantity", "unitCost", "markupPercent"] as const).map(field =>
              <label key={field}>{field} <input inputMode="decimal" required disabled={!canEdit || busy} value={line[field]}
                onChange={e => updateLine(line.id, { [field]: e.target.value })} /></label>)}
            <button type="button" disabled={!canEdit || busy || worksheet.lines.length <= 1} onClick={() => {
              setWorksheet({ ...worksheet, lines: worksheet.lines.filter(item => item.id !== line.id) });
              setRequestKey(null);
            }}>Remove line</button>
          </fieldset>
        ))}
        <button type="button" disabled={!canEdit || busy || worksheet.lines.length >= 500} onClick={() => {
          setWorksheet({ ...worksheet, lines: [...worksheet.lines, newLine()] }); setRequestKey(null);
        }}>Add line</button>
        {totals && <p>Cost: {totals.costMinor / 100} · Proposed revenue: {totals.proposedRevenueMinor / 100} · Margin: {totals.grossMarginMinor / 100} {totals.currency}</p>}
        {canEdit && <button type="submit" disabled={busy || !totals}>{busy ? "Working…" : "Save estimate"}</button>}
        {canExport && <button type="button" disabled={busy || !totals} onClick={downloadCsv}>Export estimate CSV</button>}
      </>}
    </form>
  );
}
