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
  // Reject late load/save acknowledgements after a scope change or unmount.
  const generation = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [requestKey, setRequestKey] = React.useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [revisionConflict, setRevisionConflict] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    const currentGeneration = ++generation.current;
    setWorksheet(null);
    setBusy(false);
    setRequestKey(null);
    setHasUnsavedChanges(false);
    setRevisionConflict(false);
    setError("");
    if (!enabled || !scope.canViewCosts) return;
    setBusy(true);
    load().then(row => {
      if (row) calculateProjectEstimate(row, scope);
      if (active && currentGeneration === generation.current) setWorksheet(row ?? {
        tenantId: scope.tenantId, companyId: scope.companyId, branchId: scope.branchId,
        projectId: scope.projectId, currency: "INR", revision: 0, lines: [newLine()],
      });
    }).catch(err => { if (active && currentGeneration === generation.current) setError(err instanceof Error ? err.message : "Load failed"); })
      .finally(() => { if (active && currentGeneration === generation.current) setBusy(false); });
    return () => { active = false; generation.current++; };
  }, [enabled, scope.tenantId, scope.companyId, scope.branchId, scope.projectId, scope.canViewCosts, load]);

  const updateLine = (id: string, patch: Partial<ProjectEstimateLine>) => {
    setWorksheet(previous => previous && ({
      ...previous, lines: previous.lines.map(line => line.id === id ? { ...line, ...patch } : line),
    }));
    setRequestKey(null);
    setHasUnsavedChanges(true);
    // A revision conflict is sticky until an authoritative reload; editing must not unlock stale saves.
    setMessage("");
  };
  const totals = React.useMemo(() => {
    if (!worksheet) return null;
    try { return calculateProjectEstimate(worksheet, scope); } catch { return null; }
  }, [worksheet, scope]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !worksheet || !totals || busy || revisionConflict || !hasUnsavedChanges) return;
    const currentGeneration = generation.current;
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    setBusy(true);
    setError("");
    try {
      await save(worksheet, key);
      // Never assume the adapter's acknowledgement contains the next authoritative revision.
      const current = await load();
      if (currentGeneration !== generation.current) return;
      if (!current) throw new Error("Saved estimate could not be reloaded");
      calculateProjectEstimate(current, scope);
      if (current.revision <= worksheet.revision) throw new Error("Saved estimate revision not advanced");
      setWorksheet(current);
      setRequestKey(null);
      setHasUnsavedChanges(false);
      setRevisionConflict(false);
      setMessage("Estimate saved");
    } catch (err) {
      if (currentGeneration === generation.current) {
        const conflict = (typeof err === "object" && err !== null && "status" in err && (err.status === 409 || err.status === 412)) ||
          (err instanceof Error && err.message === "Project estimate revision conflict");
        setRevisionConflict(conflict);
        setError(conflict ? "Estimate changed elsewhere. Discard edits and reload the latest revision before saving." : err instanceof Error ? err.message : "Save failed");
      }
    } finally { if (currentGeneration === generation.current) setBusy(false); }
  }

  async function reloadCurrent() {
    if (busy || !scope.canViewCosts) return;
    const currentGeneration = generation.current;
    setBusy(true);
    setError("");
    try {
      const current = await load();
      if (currentGeneration !== generation.current) return;
      if (current) calculateProjectEstimate(current, scope);
      setWorksheet(current ?? {
        tenantId: scope.tenantId, companyId: scope.companyId, branchId: scope.branchId,
        projectId: scope.projectId, currency: "INR", revision: 0, lines: [newLine()],
      });
      setRequestKey(null);
      setHasUnsavedChanges(false);
      setRevisionConflict(false);
      setMessage("Current estimate loaded");
    } catch (err) { if (currentGeneration === generation.current) setError(err instanceof Error ? err.message : "Reload failed"); }
    finally { if (currentGeneration === generation.current) setBusy(false); }
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
      {!worksheet && !busy && <button type="button" onClick={reloadCurrent}>Retry loading estimate</button>}
      {worksheet && <>
        <p aria-label="Estimate revision">Revision: {worksheet.revision}{hasUnsavedChanges ? " · Unsaved changes" : ""}</p>
        <button type="button" disabled={busy || hasUnsavedChanges} onClick={reloadCurrent}>Reload current estimate</button>
        {(hasUnsavedChanges || revisionConflict) && <div role="status">
          <p>Save or discard your edits before reloading. A revision conflict requires reloading the latest estimate.</p>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Discard unsaved estimate edits and load the latest saved revision?")) void reloadCurrent(); }}>Discard edits and reload latest</button>
        </div>}
        <label>Currency <input aria-label="Currency" value={worksheet.currency} maxLength={3} disabled={!canEdit || busy}
          onChange={e => { setWorksheet({ ...worksheet, currency: e.target.value.toUpperCase() }); setRequestKey(null); setHasUnsavedChanges(true); setMessage(""); }} /></label>
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
            <button type="button" disabled={!canEdit || busy || worksheet.lines.length >= 500} onClick={() => {
              // Copy a priced estimate item without reusing its identity; each line is independently auditable.
              const index = worksheet.lines.findIndex(item => item.id === line.id);
              if (index < 0) return;
              const lines = [...worksheet.lines];
              lines.splice(index + 1, 0, { ...line, id: crypto.randomUUID() });
              setWorksheet({ ...worksheet, lines });
              setRequestKey(null);
              setHasUnsavedChanges(true);
              setMessage("");
            }}>Duplicate line</button>
            <button type="button" disabled={!canEdit || busy || worksheet.lines.length <= 1} onClick={() => {
              setWorksheet({ ...worksheet, lines: worksheet.lines.filter(item => item.id !== line.id) });
              setRequestKey(null);
              setHasUnsavedChanges(true);
              setMessage("");
            }}>Remove line</button>
          </fieldset>
        ))}
        <button type="button" disabled={!canEdit || busy || worksheet.lines.length >= 500} onClick={() => {
          setWorksheet({ ...worksheet, lines: [...worksheet.lines, newLine()] }); setRequestKey(null); setHasUnsavedChanges(true); setMessage("");
        }}>Add line</button>
        {totals && <p>Cost: {totals.costMinor / 100} · Proposed revenue: {totals.proposedRevenueMinor / 100} · Margin: {totals.grossMarginMinor / 100} {totals.currency}</p>}
        {canEdit && <button type="submit" disabled={busy || !totals || !hasUnsavedChanges || revisionConflict}>{busy ? "Working…" : "Save estimate"}</button>}
        {canExport && <button type="button" disabled={busy || !totals} onClick={downloadCsv}>Export estimate CSV</button>}
      </>}
    </form>
  );
}
