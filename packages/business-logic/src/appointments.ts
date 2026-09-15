/** Appointment scheduling rules for fittings, consultations and pickups. */

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  customerId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  staffId?: string | null;
  notes?: string | null;
}

export interface AppointmentConflict {
  appointmentId: string;
  staffId: string;
  overlapsAppointmentId: string;
}

function validTime(value: string): number | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function validateAppointment(appointment: Appointment): string[] {
  const start = validTime(appointment.startsAt);
  const end = validTime(appointment.endsAt);
  const errors: string[] = [];
  if (start == null) errors.push("Invalid appointment start time");
  if (end == null) errors.push("Invalid appointment end time");
  if (start != null && end != null && end <= start) errors.push("Appointment end must be after start");
  if (!appointment.customerId) errors.push("Customer is required");
  if (!appointment.title.trim()) errors.push("Appointment title is required");
  return errors;
}

export function findAppointmentConflicts(
  appointments: Appointment[],
  candidate: Appointment,
): AppointmentConflict[] {
  const candidateStart = validTime(candidate.startsAt);
  const candidateEnd = validTime(candidate.endsAt);
  if (candidateStart == null || candidateEnd == null) return [];
  if (!candidate.staffId) return [];
  return appointments.filter((existing) => {
    if (existing.id === candidate.id || existing.staffId !== candidate.staffId) return false;
    if (["cancelled", "no_show"].includes(existing.status)) return false;
    const start = validTime(existing.startsAt);
    const end = validTime(existing.endsAt);
    return start != null && end != null && candidateStart < end && candidateEnd > start;
  }).map((existing) => ({
    appointmentId: candidate.id,
    staffId: candidate.staffId as string,
    overlapsAppointmentId: existing.id,
  }));
}

export function slotDurationMinutes(appointment: Appointment): number {
  const start = validTime(appointment.startsAt);
  const end = validTime(appointment.endsAt);
  return start == null || end == null ? 0 : Math.max(0, Math.round((end - start) / 60000));
}

export function nextAvailableSlot(
  appointments: Appointment[],
  staffId: string,
  requestedStart: string,
  durationMinutes: number,
): string {
  const start = validTime(requestedStart);
  const duration = Math.max(1, Math.round(durationMinutes));
  if (start == null) return requestedStart;
  let cursor = start;
  const relevant = appointments
    .filter((a) => a.staffId === staffId && !["cancelled", "no_show"].includes(a.status))
    .map((a) => ({ start: validTime(a.startsAt), end: validTime(a.endsAt) }))
    .filter((a): a is { start: number; end: number } => a.start != null && a.end != null)
    .sort((a, b) => a.start - b.start);
  for (const slot of relevant) {
    if (cursor + duration * 60000 <= slot.start) break;
    if (cursor < slot.end) cursor = slot.end;
  }
  return new Date(cursor).toISOString();
}
