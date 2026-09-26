"use client";

import * as React from "react";
import type { StaffMember } from "@minarvabiz/types";
import { DataTable, type Column } from "../data/DataTable";
import { Button } from "../Button";
import { formatMoney } from "../customers/format";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export function StaffList({
  staff,
  onAdd,
  onCreate,
  onSelect,
  onEdit,
  onArchive,
}: {
  staff: StaffMember[];
  onAdd?: () => void;
  onCreate?: () => void;
  onSelect?: (s: StaffMember) => void;
  onEdit?: (s: StaffMember) => void;
  onArchive?: (s: StaffMember, reason: string) => { success?: boolean; error?: string } | void;
}) {
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [archiveTarget, setArchiveTarget] = React.useState<StaffMember | null>(null);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((member) => {
      if (role && member.role !== role) return false;
      if (status && member.status !== status) return false;
      if (!q) return true;
      return [member.name, member.phone || "", member.email || "", member.role].some((value) => value.toLowerCase().includes(q));
    });
  }, [staff, query, role, status]);

  const columns: Column<StaffMember>[] = [
    { key: "name", header: "Name", render: (r) => <div><div className="font-medium text-slate-900">{r.name}</div>{r.phone && <div className="text-xs text-slate-500">{r.phone}</div>}{r.email && <div className="text-xs text-slate-400">{r.email}</div>}</div> },
    { key: "role", header: "Role", render: (r) => <span className="capitalize">{r.role.replace("_", " ")}</span> },
    { key: "salary", header: "Salary", render: (r) => formatMoney(r.salary) },
    { key: "status", header: "Status", render: (r) => <span className={r.status === "active" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"}>{r.status.replace("_", " ")}</span> },
    { key: "joiningDate", header: "Joined", render: (r) => r.joiningDate ? new Date(r.joiningDate).toLocaleDateString("en-IN") : "—" },
    { key: "id", header: "Actions", render: (r) => <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>{onEdit && <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>}{onArchive && <Button size="sm" variant="outline" onClick={() => { setArchiveTarget(r); setArchiveReason(""); setArchiveError(null); }}>Archive</Button>}</div> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold text-slate-900">Staff Management</h2><p className="text-sm text-slate-500">{filtered.length} of {staff.length} members</p></div>
        <Button onClick={onAdd ?? onCreate}>+ Add Staff</Button>
      </div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Search staff<input className={inputClass + " mt-1"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email or role…" /></label>
        <label className="text-xs font-medium text-slate-600">Role<select className={selectClass + " mt-1"} value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{["staff","tailor","cashier","manager","admin"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Status<select className={selectClass + " mt-1"} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option></select></label>
      </div>
      <DataTable columns={columns} rows={filtered} onRowClick={onSelect} emptyMessage="No staff match the selected filters" />
      <Modal
        open={Boolean(archiveTarget)}
        title={archiveTarget ? `Archive staff · ${archiveTarget.name}` : "Archive staff"}
        onClose={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(null); }}
        footer={<><Button variant="outline" onClick={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(null); }}>Keep staff</Button><Button disabled={archiveReason.trim().length < 3} onClick={() => {
          if (!archiveTarget || !onArchive) return;
          const result = onArchive(archiveTarget, archiveReason.trim());
          if (result && result.error) { setArchiveError(result.error); return; }
          setArchiveTarget(null); setArchiveReason(""); setArchiveError(null);
        }}>Archive staff</Button></>}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Staff records are soft-archived to preserve order assignments, incentive history and audit history. Active assignments must be completed or cancelled first.</div>
          <FormField label="Archive reason *"><textarea className={inputClass + " h-24 py-2"} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} /></FormField>
          {archiveError && <p className="text-sm text-rose-600">{archiveError}</p>}
        </div>
      </Modal>
    </div>
  );
}
