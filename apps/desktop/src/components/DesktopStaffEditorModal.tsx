import * as React from "react";
import { Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import type { RoleName } from "@minarvabiz/types";

export type DesktopStaffForm = {
  name: string;
  phone: string;
  email: string;
  role: RoleName;
  salary: string;
  joiningDate: string;
  status: "active" | "inactive" | "on_leave";
  notes: string;
};

export function DesktopStaffEditorModal({
  open,
  editing,
  form,
  setForm,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: boolean;
  form: DesktopStaffForm;
  setForm: React.Dispatch<React.SetStateAction<DesktopStaffForm>>;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      title={editing ? "Edit Staff" : "Add Staff"}
      onClose={onClose}
      footer={<><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" onClick={onSave}>{editing ? "Update Staff" : "Save Staff"}</Button></>}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Full name *"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Role"><select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })}><option value="staff">Staff</option><option value="tailor">Tailor</option><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="admin">Admin</option></select></FormField>
        <FormField label="Salary"><input className={inputClass} type="number" min="0" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></FormField>
        <FormField label="Joining date"><input className={inputClass} type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></FormField>
        <FormField label="Status"><select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DesktopStaffForm["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option></select></FormField>
        <FormField label="Notes"><textarea className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></FormField>
      </div>
    </Modal>
  );
}
