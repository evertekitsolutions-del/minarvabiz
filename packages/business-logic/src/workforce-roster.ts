/**
 * HR-004 shift/roster scheduling engine, shared by Online, Offline and Hybrid.
 *
 * A workDate is the *branch-local calendar day*. Times are local wall-clock
 * coordinates; do not convert them into UTC or calculate payroll instants
 * without an explicit branch IANA time zone and DST resolution policy.
 * This engine validates roster planning, not statutory rest/payroll rules.
 */
export interface ShiftRule {
  id: string;
  name: string;
  startTime: string; // HH:mm (branch-local)
  endTime: string; // HH:mm (branch-local); <= start means next calendar day
  unpaidBreakMinutes: number;
  branchId: string | null;
  active: boolean;
  /** Optimistic cloud revision. Legacy v14 offline snapshots may omit it. */
  version?: number;
}
export interface RosterSlot {
  id: string;
  staffId: string;
  workDate: string; // YYYY-MM-DD, branch-local
  shiftRuleId: string;
  branchId: string | null;
  status: "scheduled" | "cancelled";
  version: number;
}
export interface StaffRosterContext {
  id: string;
  status: string;
  deletedAt?: string | null;
  branchId?: string | null;
}
export interface RosterPolicy {
  // Organization-configured planning rule, not a jurisdictional default.
  minimumRestMinutes?: number;
}
export type RosterDecision =
  | { ok: true; entry: RosterSlot; workedMinutes: number; overnight: boolean }
  | { ok: false; errors: string[] };

function isRecordDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  if (year < 1900 || year > 9999) return false;
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function minuteOfDay(time: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Shift clock time must be HH:mm (00:00–23:59)");
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
function timeline(entry: RosterSlot, shift: ShiftRule): { start: number; end: number } {
  const [y, m, d] = entry.workDate.split("-").map(Number);
  const day = Date.UTC(y, m - 1, d) / 60000;
  const start = minuteOfDay(shift.startTime), end = minuteOfDay(shift.endTime);
  return { start: day + start, end: day + end + (end <= start ? 1440 : 0) };
}
export function validateShiftRule(rule: ShiftRule): { spanMinutes: number; workedMinutes: number; overnight: boolean } {
  if (!rule.id || !rule.id.trim() || !rule.name || !rule.name.trim() || rule.name.trim().length > 120) throw new Error("Shift id and name (max 120 chars) are required");
  if (rule.branchId !== null && (!rule.branchId || !rule.branchId.trim())) throw new Error("Shift branch must be a valid identifier or null");
  if (typeof rule.active !== "boolean") throw new Error("Shift active flag is invalid");
  if (rule.version !== undefined && (!Number.isSafeInteger(rule.version) || rule.version < 1)) throw new Error("Shift revision must be a positive integer");
  const start = minuteOfDay(rule.startTime), end = minuteOfDay(rule.endTime);
  const overnight = end <= start;
  const spanMinutes = end - start + (overnight ? 1440 : 0);
  // An identical time denotes a full 24-hour shift, not a zero-hour shift.
  if (spanMinutes > 24 * 60 || spanMinutes < 1) throw new Error("Invalid shift duration");
  if (!Number.isSafeInteger(rule.unpaidBreakMinutes) || rule.unpaidBreakMinutes < 0 || rule.unpaidBreakMinutes >= spanMinutes) {
    throw new Error("Unpaid break must be an integer smaller than the shift duration");
  }
  return { spanMinutes, workedMinutes: spanMinutes - rule.unpaidBreakMinutes, overnight };
}

/** Validates a proposed immutable/revisioned roster slot before a domain mutation. */
export function checkRosterSlot(
  input: {
    candidate: RosterSlot;
    slots: readonly RosterSlot[];
    shifts: readonly ShiftRule[];
    staff: StaffRosterContext | null;
    policy?: RosterPolicy;
  },
): RosterDecision {
  const { candidate, slots, shifts, staff, policy } = input;
  const errors: string[] = [];
  if (!candidate.id?.trim() || !candidate.staffId?.trim() || !candidate.shiftRuleId?.trim()) errors.push("Roster identity is required");
  if (!isRecordDate(candidate.workDate)) errors.push("Roster workDate must be a real YYYY-MM-DD date");
  if (!["scheduled", "cancelled"].includes(candidate.status)) errors.push("Invalid roster status");
  if (!Number.isSafeInteger(candidate.version) || candidate.version < 1) errors.push("Roster version must be a positive integer");
  if (!staff || staff.id !== candidate.staffId) errors.push("Staff member is unavailable");
  if (staff?.deletedAt && !slots.some(slot => slot.id === candidate.id)) errors.push("Cannot schedule an archived staff member");
  if (staff?.status !== "active" && !slots.some(slot => slot.id === candidate.id)) errors.push("Only active staff can receive new shifts");
  const shift = shifts.find(s => s.id === candidate.shiftRuleId);
  let duration: ReturnType<typeof validateShiftRule> | null = null;
  if (!shift) errors.push("Shift template is unavailable");
  else {
    try { duration = validateShiftRule(shift); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (candidate.status === "scheduled" && !shift.active) errors.push("Cannot assign an inactive shift template");
    // A null template branch means a reusable organization-wide shift rule.
    if (shift.branchId !== null && candidate.branchId !== shift.branchId) errors.push("Roster branch must match the shift template branch");
  }
  const previous = slots.find(s => s.id === candidate.id);
  if (previous) {
    if (previous.staffId !== candidate.staffId || previous.workDate !== candidate.workDate || previous.branchId !== candidate.branchId) {
      errors.push("Staff, original workDate and branch are immutable for a roster correction");
    }
    if (candidate.version !== previous.version + 1) errors.push("Stale roster version");
  } else if (candidate.version !== 1) errors.push("New roster assignments start at version 1");
  // A branch transfer does not invalidate historic revisions, but a new
  // assignment must use the staff member's presently allocated branch.
  if (!previous && candidate.branchId !== (staff?.branchId ?? null)) errors.push("New roster branch does not match the staff branch");
  const rest = policy?.minimumRestMinutes ?? 0;
  if (!Number.isSafeInteger(rest) || rest < 0 || rest > 24 * 60) errors.push("Minimum rest must be an integer between 0 and 1440 minutes");
  if (candidate.status === "scheduled" && duration && isRecordDate(candidate.workDate)) {
    const own = timeline(candidate, shift!);
    for (const other of slots) {
      if (other.id === candidate.id || other.status !== "scheduled" || other.staffId !== candidate.staffId) continue;
      const otherShift = shifts.find(s => s.id === other.shiftRuleId);
      if (!otherShift || !isRecordDate(other.workDate)) {
        errors.push("An existing roster assignment is invalid; review it before scheduling");
        continue;
      }
      try {
        validateShiftRule(otherShift);
        const t = timeline(other, otherShift);
        if (own.start < t.end && t.start < own.end) errors.push(`Shift overlaps existing assignment ${other.id}`);
        else if (rest > 0 && Math.min(Math.abs(own.start - t.end), Math.abs(t.start - own.end)) < rest) {
          errors.push(`Minimum rest would be violated by assignment ${other.id}`);
        }
      } catch { errors.push("An existing shift template is invalid; review it before scheduling"); }
    }
  }
  if (errors.length || !duration) return { ok: false, errors };
  return { ok: true, entry: { ...candidate }, workedMinutes: duration.workedMinutes, overnight: duration.overnight };
}

/** Ordered, read-only weekly planner for UI previews and printable rosters. */
export function rosterRange(slots: readonly RosterSlot[], from: string, to: string, staffId?: string): RosterSlot[] {
  if (!isRecordDate(from) || !isRecordDate(to) || from > to) throw new Error("Roster range must contain valid ordered dates");
  return slots.filter(slot => slot.status === "scheduled" && slot.workDate >= from && slot.workDate <= to && (!staffId || slot.staffId === staffId))
    .map(slot => ({ ...slot }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.staffId.localeCompare(b.staffId) || a.id.localeCompare(b.id));
}


/**
 * Build a deterministic branch-local recurring roster *preview* without writing
 * to any store. Reuses the authoritative single-slot overlap/rest validator.
 * The caller supplies stable, unique IDs when it later chooses to commit a
 * reviewed plan; neither this function nor its result implies cloud approval.
 * IANA timezone/DST instant resolution is a separate required HR-004 gate.
 */
export function planRecurringRoster(input: {
  staffId: string;
  shiftRuleId: string;
  branchId: string | null;
  startDate: string;
  endDate: string;
  weekdays: readonly number[]; // ISO weekdays: Monday=1, Sunday=7
  slots: readonly RosterSlot[];
  shifts: readonly ShiftRule[];
  staff: StaffRosterContext | null;
  policy?: RosterPolicy;
  idForDate: (date: string) => string;
}): { ok: true; entries: RosterSlot[] } | { ok: false; errors: string[] } {
  const { startDate, endDate, weekdays, slots, shifts, staff, policy } = input;
  const errors: string[] = [];
  if (!isRecordDate(startDate) || !isRecordDate(endDate) || startDate > endDate) {
    errors.push("Recurring roster needs real ordered branch-local dates");
  }
  if (!Array.isArray(weekdays) || weekdays.length === 0 ||
      weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 7) ||
      new Set(weekdays).size !== weekdays.length) {
    errors.push("Select unique ISO weekdays from Monday (1) to Sunday (7)");
  }
  if (typeof input.idForDate !== "function") errors.push("A roster ID factory is required");
  if (errors.length) return { ok: false, errors };
  const first = Date.parse(startDate + "T00:00:00Z");
  const last = Date.parse(endDate + "T00:00:00Z");
  // Bound each atomic preview to one calendar year; longer plans can be
  // submitted in reviewed consecutive windows without losing features.
  if ((last - first) / 86400000 >= 366) {
    return { ok: false, errors: ["Recurring roster preview spans at most 366 days per batch"] };
  }

  const entries: RosterSlot[] = [];
  const usedIds = new Set(slots.map(slot => slot.id));
  const selected = new Set(weekdays);
  for (let day = first; day <= last; day += 86400000) {
    const d = new Date(day);
    const weekday = d.getUTCDay() || 7;
    if (!selected.has(weekday)) continue;
    const date = d.toISOString().slice(0, 10);
    let id: string;
    try {
      id = input.idForDate(date);
    } catch (error) {
      errors.push(`${date}: roster ID generation failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (typeof id !== "string" || !id.trim() || usedIds.has(id)) {
      errors.push(`${date}: roster ID is blank or already used`);
      continue;
    }
    usedIds.add(id);
    const candidate: RosterSlot = {
      id, staffId: input.staffId, shiftRuleId: input.shiftRuleId,
      branchId: input.branchId, workDate: date, version: 1, status: "scheduled",
    };
    const decision = checkRosterSlot({
      candidate, slots: [...slots, ...entries], shifts, staff, policy,
    });
    if (!decision.ok) errors.push(...decision.errors.map(message => `${date}: ${message}`));
    else entries.push(decision.entry);
  }
  // A conflict on any planned date rejects the entire reviewed set. Never
  // return a partial "success" that a UI might accidentally commit.
  return errors.length ? { ok: false, errors } : { ok: true, entries };
}
