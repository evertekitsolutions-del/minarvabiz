"use client";

import * as React from "react";
import {
  getRecycleBinSettings,
  listRecycleBinItems,
  permanentlyDeleteRecycleBinItem,
  purgeExpiredRecycleBinItems,
  restoreRecycleBinItem,
  setRecycleBinSettings,
  type RecycleBinItem,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass } from "../forms/FormField";

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function daysUntil(value: string): number {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

export function TrashRecoveryPanel() {
  const [items, setItems] = React.useState<RecycleBinItem[]>([]);
  const [retentionDays, setRetentionDays] = React.useState(() => getRecycleBinSettings().retentionDays);
  const [draftRetention, setDraftRetention] = React.useState(String(retentionDays));
  const [query, setQuery] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<RecycleBinItem | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback((purgeExpired = true) => {
    setError(null);
    try {
      if (purgeExpired) {
        const result = purgeExpiredRecycleBinItems();
        if (result.errors.length) setError(result.errors.join("; "));
        if (result.purged > 0) setMessage(`${result.purged} expired Trash item${result.purged === 1 ? "" : "s"} permanently deleted.`);
      }
      setItems(listRecycleBinItems());
      const current = getRecycleBinSettings().retentionDays;
      setRetentionDays(current);
      setDraftRetention(String(current));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems(listRecycleBinItems());
    }
  }, []);

  React.useEffect(() => {
    refresh(true);
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      item.recordLabel.toLowerCase().includes(normalized)
      || item.entityLabel.toLowerCase().includes(normalized)
    );
  }, [items, query]);

  function saveRetention() {
    setError(null);
    setMessage(null);
    try {
      const next = setRecycleBinSettings({ retentionDays: Number(draftRetention) });
      setRetentionDays(next.retentionDays);
      setDraftRetention(String(next.retentionDays));
      const purgeResult = purgeExpiredRecycleBinItems();
      setItems(listRecycleBinItems());
      setMessage(
        purgeResult.purged > 0
          ? `Trash retention saved. ${purgeResult.purged} expired item${purgeResult.purged === 1 ? "" : "s"} permanently deleted.`
          : "Trash retention saved."
      );
      if (purgeResult.errors.length) setError(purgeResult.errors.join("; "));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function restore(item: RecycleBinItem) {
    setError(null);
    setMessage(null);
    try {
      const result = restoreRecycleBinItem(item.entityType, item.id);
      if (!result.ok) {
        setError(result.error || "Restore failed");
        return;
      }
      setMessage(`${item.entityLabel} restored: ${item.recordLabel}`);
      setItems(listRecycleBinItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function permanentlyDelete() {
    if (!deleteTarget) return;
    setError(null);
    setMessage(null);
    try {
      const result = permanentlyDeleteRecycleBinItem(deleteTarget.entityType, deleteTarget.id);
      if (!result.ok) {
        setError(result.error || "Permanent deletion failed");
        return;
      }
      setMessage(`Permanently deleted: ${deleteTarget.recordLabel}`);
      setDeleteTarget(null);
      setItems(listRecycleBinItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Trash & Recovery</h2>
          <p className="mt-1 text-xs text-slate-500">
            Deleted customers, products, suppliers, staff and quotations stay recoverable here before automatic permanent deletion.
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {items.length} item{items.length === 1 ? "" : "s"} in Trash
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
        <FormField label="Search Trash">
          <input
            className={inputClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer, product, quotation…"
          />
        </FormField>
        <FormField label="Auto-delete after (days)">
          <input
            className={inputClass}
            type="number"
            min={1}
            max={3650}
            value={draftRetention}
            onChange={(event) => setDraftRetention(event.target.value)}
          />
        </FormField>
        <Button onClick={saveRetention}>Save retention</Button>
      </div>

      <p className="text-xs text-slate-500">
        Current retention: <strong>{retentionDays} days</strong>. Expired Trash items are permanently deleted when Trash is checked.
        Posted invoices and other financial/audit records are never silently deleted; they use cancellation/reversal history instead.
      </p>

      {message && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Deleted</th>
              <th className="px-3 py-2">Permanent deletion</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.map((item) => (
              <tr key={item.entityType + ":" + item.id}>
                <td className="px-3 py-3 text-slate-600">{item.entityLabel}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{item.recordLabel}</td>
                <td className="px-3 py-3 text-slate-600">{formatDate(item.deletedAt)}</td>
                <td className="px-3 py-3 text-slate-600">
                  <div>{formatDate(item.purgeAt)}</div>
                  <div className="text-xs text-slate-400">{daysUntil(item.purgeAt)} day{daysUntil(item.purgeAt) === 1 ? "" : "s"} left</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => restore(item)}>Restore</Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(item)}>Delete permanently</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                  {items.length ? "No Trash items match your search." : "Trash is empty."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        title="Permanently delete from Trash?"
        onClose={() => setDeleteTarget(null)}
        footer={<>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep in Trash</Button>
          <Button onClick={permanentlyDelete}>Delete permanently</Button>
        </>}
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p><strong className="text-slate-900">{deleteTarget?.recordLabel}</strong> will no longer be recoverable.</p>
          <p>This action cannot be undone. Audit records and posted financial history remain protected separately.</p>
        </div>
      </Modal>
    </div>
  );
}
