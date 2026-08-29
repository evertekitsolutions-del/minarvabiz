"use client";

import * as React from "react";
import {
  StaffList, StaffDetail, Modal, Button, FormField, inputClass, selectClass,
} from "@minarvabiz/ui";
import { phase6Store, ordersStore } from "@minarvabiz/business-logic";
import type { StaffMember, StaffAssignment, StaffIncentivePayout, IncentiveRuleRecord, RoleName } from "@minarvabiz/types";

export default function StaffPage() {
  const [staff, setStaff] = React.useState<StaffMember[]>([]);
  const [selected, setSelected] = React.useState<StaffMember | null>(null);
  const [assignments, setAssignments] = React.useState<StaffAssignment[]>([]);
  const [payouts, setPayouts] = React.useState<StaffIncentivePayout[]>([]);
  const [rules, setRules] = React.useState<IncentiveRuleRecord[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", phone: "", role: "tailor" as RoleName | "tailor" | "staff", salary: "15000",
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

  function saveStaff() {
    if (!form.name.trim()) return;
    phase6Store.createStaff({
      name: form.name,
      phone: form.phone || null,
      role: form.role,
      salary: parseFloat(form.salary) || 0,
    });
    setOpen(false);
    setForm({ name: "", phone: "", role: "tailor", salary: "15000" });
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
      <StaffList staff={staff} onAdd={() => setOpen(true)} onSelect={selectStaff} />
      <Modal open={open} title="Add Staff" onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={saveStaff}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Name *">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
        </div>
      </Modal>
    </>
  );
}
