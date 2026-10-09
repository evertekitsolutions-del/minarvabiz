"use client";

import * as React from "react";
import type { StaffMember } from "@minarvabiz/types";
import { workforceRoster } from "@minarvabiz/business-logic";
type ShiftRule = workforceRoster.ShiftRule;
type RosterSlot = workforceRoster.RosterSlot;
type RosterPolicy = workforceRoster.RosterPolicy;
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

type SlotInput = Omit<RosterSlot, "id" | "version"> & { id?: string; expectedVersion?: number };
type ShiftForm = Omit<ShiftRule, "id" | "version">;
export interface RosterPlannerProps {
  staff: StaffMember[];
  shifts: ShiftRule[];
  slots: RosterSlot[];
  branches: { id: string; name: string }[];
  canEdit: boolean;
  onSaveShift: (values: ShiftForm, id?: string) => Promise<void>;
  onSaveSlot: (values: SlotInput, policy: RosterPolicy) => Promise<void>;
}
/** Shared HTML/React workforce planner; all mutations are injected by authorized host adapters. */
export function RosterPlanner({ staff, shifts, slots, branches, canEdit, onSaveShift, onSaveSlot }: RosterPlannerProps) {
  const [staffId, setStaffId] = React.useState("");
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [name, setName] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("17:00");
  const [unpaidBreakMinutes, setBreakMinutes] = React.useState("30");
  const [templateBranchId, setTemplateBranchId] = React.useState("");
  const [editingShift, setEditingShift] = React.useState<string | null>(null);
  const [shiftId, setShiftId] = React.useState("");
  const [workDate, setWorkDate] = React.useState("");
  const [editingSlot, setEditingSlot] = React.useState<RosterSlot | null>(null);
  const [minimumRestMinutes, setMinimumRestMinutes] = React.useState("0");
  const [weekdays, setWeekdays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [preview, setPreview] = React.useState<RosterSlot[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const member = staff.find(s => s.id === staffId) ?? null;
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const from = monthValid ? month + "-01" : "";
  const to = monthValid ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  const visibleSlots = slots.filter(s => (!staffId || s.staffId === staffId) && (!monthValid || s.workDate >= from && s.workDate <= to))
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.staffId.localeCompare(b.staffId) || a.id.localeCompare(b.id));
  const branchLabel = (id: string | null | undefined) => branches.find(b => b.id === id)?.name ?? (id ? "Unknown branch" : "Organization-wide");
  const shiftLabel = (id: string) => shifts.find(s => s.id === id)?.name ?? "Archived shift";
  const memberLabel = (id: string) => staff.find(s => s.id === id)?.name ?? "Archived employee";
  function policy(): RosterPolicy {
    const value = Number(minimumRestMinutes);
    if (!Number.isSafeInteger(value) || value < 0 || value > 1440) throw new Error("Minimum rest must be 0–1440 minutes; configure your organization's policy");
    return { minimumRestMinutes: value };
  }
  function clearFeedback() { setError(null); setMessage(null); setPreview([]); }
  async function run(action: () => Promise<void>, success: string) {
    clearFeedback(); setBusy(true);
    try { await action(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function saveShift(event: React.FormEvent) {
    event.preventDefault(); if (!canEdit || busy) return;
    await run(async () => {
      const values: ShiftForm = {
        name: name.trim(), startTime, endTime, unpaidBreakMinutes: Number(unpaidBreakMinutes),
        branchId: templateBranchId || null, active: editingShift ? (shifts.find(s => s.id === editingShift)?.active ?? true) : true,
      };
      workforceRoster.validateShiftRule({ ...values, id: editingShift ?? "shift-preview" });
      await onSaveShift(values, editingShift ?? undefined);
      setEditingShift(null); setName("");
    }, "Shift template saved and queued for durable persistence");
  }

  /** An audited soft lifecycle action: never delete historical shift templates. */
  async function toggleShiftActive(shift: ShiftRule) {
    if (!canEdit || busy) return;
    const nextActive = !shift.active;
    const action = nextActive ? "reactivate" : "deactivate";
    const message = nextActive
      ? `Reactivate "${shift.name}" for future assignments? Historical rosters will remain unchanged.`
      : `Deactivate "${shift.name}"? New assignments will be blocked, but existing rosters and audit history will be retained.`;
    if (!window.confirm(message)) return;
    await run(() => onSaveShift({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      branchId: shift.branchId,
      active: nextActive,
    }, shift.id), `Shift template ${action}d; existing roster history retained.`);
  }
  async function saveSlot(event: React.FormEvent) {
    event.preventDefault(); if (!canEdit || busy) return;
    await run(async () => {
      if (!member) throw new Error("Select an employee");
      if (!shiftId) throw new Error("Select a shift");
      const current = editingSlot;
      await onSaveSlot({
        id: current?.id, expectedVersion: current?.version,
        staffId: current?.staffId ?? member.id,
        shiftRuleId: shiftId,
        workDate: current?.workDate ?? workDate,
        branchId: current ? current.branchId : member.branchId ?? null,
        status: "scheduled",
      }, policy());
      setEditingSlot(null);
    }, editingSlot ? "Roster correction saved" : "Roster assignment saved");
  }
  async function cancelSlot(slot: RosterSlot) {
    if (!canEdit || busy || slot.status === "cancelled") return;
    if (!window.confirm(`Cancel this roster entry for ${memberLabel(slot.staffId)} on ${slot.workDate}? The audit history will be retained.`)) return;
    await run(() => onSaveSlot({
      id: slot.id, expectedVersion: slot.version,
      staffId: slot.staffId, shiftRuleId: slot.shiftRuleId,
      workDate: slot.workDate, branchId: slot.branchId, status: "cancelled",
    }, policy()), "Roster assignment cancelled with revision history retained");
  }
  function planWeekdays() {
    clearFeedback();
    try {
      if (!member) throw new Error("Select an employee");
      if (!shiftId) throw new Error("Select a shift");
      if (!monthValid) throw new Error("Select a valid planning month");
      const result = workforceRoster.planRecurringRoster({
        staffId: member.id, shiftRuleId: shiftId, branchId: member.branchId ?? null,
        startDate: from, endDate: to, weekdays,
        slots, shifts, staff: member, policy: policy(),
        idForDate: date => `preview-${date}`,
      });
      if (!result.ok) throw new Error(result.errors.join("; "));
      setPreview(result.entries);
      setMessage(`${result.entries.length} proposed dates validated. Preview only: no changes were saved.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return <section className="space-y-5" aria-label="Shift and roster planner">
    <header><h2 className="text-xl font-semibold text-slate-900">Shift & Roster Planner</h2>
      <p className="text-sm text-slate-600">Branch-local dates and times. Overnight shifts are supported; DST and statutory payroll rules require a configured country/time-zone policy.</p>
      {!canEdit && <p role="alert" className="text-sm text-amber-700">Read-only: scheduling permission or secure writer is unavailable.</p>}
    </header>
    {error && <p role="alert" className="rounded border border-rose-300 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded border border-slate-300 p-3 text-sm">{message}</p>}
    <form className="space-y-3 rounded-xl border p-4" onSubmit={saveShift}>
      <h3 className="font-semibold">Shift templates</h3>
      <div className="grid gap-3 md:grid-cols-5">
        <label className="text-sm">Template name<input className={inputClass} required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="text-sm">Start<input className={inputClass} type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
        <label className="text-sm">End<input className={inputClass} type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></label>
        <label className="text-sm">Unpaid break (minutes)<input className={inputClass} type="number" min={0} step={1} required value={unpaidBreakMinutes} onChange={e => setBreakMinutes(e.target.value)} /></label>
        <label className="text-sm">Branch<select className={selectClass} value={templateBranchId} onChange={e => setTemplateBranchId(e.target.value)}><option value="">Organization-wide</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button disabled={!canEdit || busy} type="submit">{editingShift ? "Save template correction" : "Add shift template"}</Button>
        {editingShift && <Button type="button" variant="outline" onClick={() => { setEditingShift(null); setName(""); }}>Cancel editing</Button>}</div>
      {shifts.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Template</th><th className="p-2">Hours</th><th className="p-2">Break</th><th className="p-2">Branch</th><th className="p-2">Revision</th><th className="p-2">Actions</th></tr></thead><tbody>
        {shifts.map(s => <tr key={s.id} className="border-t"><td className="p-2">{s.name}{!s.active ? " (inactive)" : ""}</td><td className="p-2">{s.startTime}–{s.endTime}{s.endTime <= s.startTime ? " (+1 day)" : ""}</td><td className="p-2">{s.unpaidBreakMinutes} min</td><td className="p-2">{branchLabel(s.branchId)}</td><td className="p-2">{s.version ?? 1}</td><td className="p-2"><Button size="sm" variant="outline" type="button" disabled={!canEdit || busy} onClick={() => { clearFeedback(); setEditingShift(s.id); setName(s.name); setStartTime(s.startTime); setEndTime(s.endTime); setBreakMinutes(String(s.unpaidBreakMinutes)); setTemplateBranchId(s.branchId ?? ""); }}>Edit</Button>{" "}<Button size="sm" variant="outline" type="button" disabled={!canEdit || busy} aria-label={`${s.active ? "Deactivate" : "Reactivate"} shift ${s.name}`} onClick={() => void toggleShiftActive(s)}>{s.active ? "Deactivate" : "Reactivate"}</Button></td></tr>)}
      </tbody></table></div>}
    </form>
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Employee roster</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Employee<select className={selectClass} value={staffId} onChange={e => {setStaffId(e.target.value);setEditingSlot(null);setPreview([]);}}><option value="">All staff</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.status !== "active" ? " (inactive)" : ""}</option>)}</select></label>
        <label className="text-sm">Planning month<input className={inputClass} type="month" value={month} onChange={e => {setMonth(e.target.value);setPreview([]);}} /></label>
        <label className="text-sm">Organization minimum rest (minutes)<input className={inputClass} type="number" min={0} max={1440} step={1} value={minimumRestMinutes} onChange={e => setMinimumRestMinutes(e.target.value)} /></label>
      </div>
      <p className="text-sm text-slate-500">Selected employee branch: {member ? branchLabel(member.branchId) : "Select an employee for scheduling"}</p>
      <form onSubmit={saveSlot} className="grid items-end gap-3 md:grid-cols-4">
        <label className="text-sm">Work date<input className={inputClass} type="date" required value={editingSlot?.workDate ?? workDate} disabled={Boolean(editingSlot)} onChange={e=>setWorkDate(e.target.value)} /></label>
        <label className="text-sm">Shift<select className={selectClass} required value={shiftId} onChange={e=>setShiftId(e.target.value)}><option value="">Select shift</option>{shifts.filter(s=>s.active && (!member || s.branchId === null || s.branchId === (member.branchId ?? null))).map(s=><option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>)}</select></label>
        <Button type="submit" disabled={!canEdit || busy || !member}>{editingSlot ? "Save correction" : "Assign shift"}</Button>
        {editingSlot && <Button type="button" variant="outline" onClick={()=>{setEditingSlot(null);setShiftId("");}}>Cancel correction</Button>}
      </form>
      <div className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Recurring weekly pattern — preview</h4>
        <div className="flex flex-wrap gap-3">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,i)=><label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={weekdays.includes(i+1)} onChange={e=>{setWeekdays(old=>e.target.checked?[...old,i+1].sort():old.filter(n=>n!==i+1));setPreview([]);}} />{day}</label>)}</div>
        <Button type="button" variant="outline" disabled={!member || !shiftId || busy} onClick={planWeekdays}>Validate monthly recurrence</Button>
        {preview.length > 0 && <div className="text-sm"><p>Proposed dates (not saved): {preview.map(p=>p.workDate).join(", ")}</p><p>Review the dates, then save individual assignments above. Atomic bulk approval is not enabled until the audited cloud transaction workflow exists.</p></div>}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Date</th><th className="p-2">Employee</th><th className="p-2">Shift</th><th className="p-2">Branch</th><th className="p-2">Status / version</th><th className="p-2">Actions</th></tr></thead><tbody>
        {visibleSlots.map(slot => <tr key={slot.id} className="border-t"><td className="p-2">{slot.workDate}</td><td className="p-2">{memberLabel(slot.staffId)}</td><td className="p-2">{shiftLabel(slot.shiftRuleId)}</td><td className="p-2">{branchLabel(slot.branchId)}</td><td className="p-2">{slot.status} · v{slot.version}</td><td className="p-2 flex flex-wrap gap-2">
        {slot.status==="scheduled" && <><Button size="sm" variant="outline" disabled={!canEdit||busy} onClick={()=>{clearFeedback();setStaffId(slot.staffId);setEditingSlot(slot);setShiftId(slot.shiftRuleId);}}>Correct</Button><Button size="sm" variant="outline" disabled={!canEdit||busy} onClick={()=>void cancelSlot(slot)}>Cancel shift</Button></>}
        </td></tr>)}
        {visibleSlots.length===0&&<tr><td colSpan={6} className="p-3 text-center text-slate-500">No roster entries for this period.</td></tr>}
      </tbody></table></div>
    </div>
  </section>;
}
