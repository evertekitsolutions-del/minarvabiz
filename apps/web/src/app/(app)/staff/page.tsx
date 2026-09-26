"use client";

import * as React from "react";
import {
  StaffList, StaffDetail, Modal, Button, FormField, inputClass, selectClass,
} from "@minarvabiz/ui";
import { phase6Store, ordersStore } from "@minarvabiz/business-logic";
import type { StaffMember, StaffAssignment, StaffIncentivePayout, IncentiveRuleRecord, RoleName } from "@minarvabiz/types";

function todayLocal(): string { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 10); }

export default function StaffPage() {
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [selected, setSelected] = React.useState<StaffMember | null>(null);
  const [assignments, setAssignments] = React.useState<StaffAssignment[]>([]);
  const [payouts, setPayouts] = React.useState<StaffIncentivePayout[]>([]);
  const [rules, setRules] = React.useState<IncentiveRuleRecord[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "", phone: "", email: "", role: "tailor" as RoleName | "tailor" | "staff", salary: "15000", joiningDate: todayLocal(), status: "active" as "active" | "inactive" | "on_leave", notes: "",
  });

  const refresh = React.useCallback(() => {
    setStaff(phase6Store.listStaff());
    setRules(phase6Store.listIncentiveRules());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function selectStaff(s: StaffMember) {
    setSelected(s);
    setAssignments(phase6Store.listAssignments({ staffId: s.id }));
    setPayouts(phase6Store.listIncentivePayouts(s.id));
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", phone: "", email: "", role: "tailor", salary: "15000", joiningDate: todayLocal(), status: "active", notes: "" });
  }

  function openEdit(member: StaffMember) {
    setEditingId(member.id);
    setForm({ name: member.name, phone: member.phone || "", email: member.email || "", role: member.role, salary: String(member.salary), joiningDate: member.joiningDate || todayLocal(), status: member.status, notes: member.notes || "" });
    setOpen(true);
  }

  function saveStaff() {
    if (!form.name.trim()) return;
    const payload = { name: form.name, phone: form.phone || null, email: form.email || null, role: form.role, salary: parseFloat(form.salary) || 0, joiningDate: form.joiningDate || null, status: form.status, notes: form.notes || null };
    if (editingId) phase6Store.updateStaff(editingId, payload);
    else phase6Store.createStaff(payload);
    setOpen(false);
    resetForm();
    refresh();
  }

  const openOrders = ordersStore.listOrders()
    .filter((o) => o.status === "pending" || o.status === "processing")
    .map((o) => ({ id: o.id, label: `${o.orderNumber} — ${o.customerName}` }));

  if (selected) {
    const prod = phase6Store.staffProductivity(selected.id);
    return (
      <StaffDetail
        staff={selected}
        assignments={assignments}
        payouts={payouts}
        rules={rules}
        productivity={prod}
        ordersForAssign={openOrders}
        onAssign={(orderId) => {
          phase6Store.assignStaffToOrder({ staffId: selected.id, orderId });
          selectStaff(selected);
          refresh();
        }}
        onCompleteAssignment={(id) => {
          phase6Store.completeAssignment(id);
          selectStaff(selected);
        }}
        onMarkPaid={(id) => {
          phase6Store.markIncentivePaid(id);
          selectStaff(selected);
        }}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <>
      <StaffList staff={staff} onAdd={() => { resetForm(); setOpen(true); }} onSelect={selectStaff} onEdit={openEdit} onArchive={(member, reason) => { const result = phase6Store.archiveStaff(member.id, reason); if (result.error) return { error: result.error }; refresh(); return { success: true }; }} />
      <Modal open={open} title={editingId ? "Edit Staff" : "Add Staff"} onClose={() => { setOpen(false); resetForm(); }}
        footer={<><Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
          <Button onClick={saveStaff}>{editingId ? "Update Staff" : "Save Staff"}</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Role">
            <select className={selectClass} value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
              <option value="tailor">Tailor</option>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </FormField>
          <FormField label="Salary">
            <input type="number" className={inputClass} value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          </FormField>
          <FormField label="Joining date">
            <input type="date" className={inputClass} value={form.joiningDate}
              onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          </FormField>
          <FormField label="Status">
            <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </FormField>
          <FormField label="Notes">
            <textarea className={inputClass + " h-20 py-2"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
