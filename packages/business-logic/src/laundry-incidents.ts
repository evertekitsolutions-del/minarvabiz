/** Offline-first garment incident claims. Estimates are not refunds or ledger postings. */
import { generateId, nowISO, toMinorUnits, fromMinorUnits } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import { listLaundryOrders } from "./phase5-store";

export const LAUNDRY_INCIDENT_TYPES = ["damage", "lost", "stain", "color_bleed", "rework", "other"] as const;
export type LaundryIncidentType = typeof LAUNDRY_INCIDENT_TYPES[number];
export type LaundryIncidentStatus = "open" | "resolved" | "rejected";
export interface LaundryIncident {
  id: string;
  orderId: string;
  itemTag: string | null;
  incidentType: LaundryIncidentType;
  description: string;
  status: LaundryIncidentStatus;
  estimatedCustomerCompensation: number;
  estimatedVendorRecovery: number;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const incidents: LaundryIncident[] = [];
const types = new Set<string>(LAUNDRY_INCIDENT_TYPES);

const amount = (value: number) => {
  if (!Number.isFinite(value) || value < 0) throw new Error("Incident estimate must be a finite non-negative amount");
  return fromMinorUnits(toMinorUnits(value));
};

export function validateLaundryIncidents(input: unknown): LaundryIncident[] {
  if (!Array.isArray(input) || input.length > 100000) throw new Error("Invalid laundry incident archive");
  const ids = new Set<string>();
  return input.map(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid laundry incident");
    const value = raw as LaundryIncident;
    if (!value.id || typeof value.id !== "string" || ids.has(value.id)
      || typeof value.orderId !== "string" || !value.orderId
      || (value.itemTag != null && typeof value.itemTag !== "string")
      || !types.has(value.incidentType)
      || !["open", "resolved", "rejected"].includes(value.status)
      || typeof value.description !== "string" || !value.description.trim() || value.description.length > 2000
      || (value.resolutionNotes != null && typeof value.resolutionNotes !== "string")
      || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
      throw new Error("Invalid laundry incident fields");
    }
    ids.add(value.id);
    return { ...value,
      description: value.description.trim(),
      estimatedCustomerCompensation: amount(value.estimatedCustomerCompensation),
      estimatedVendorRecovery: amount(value.estimatedVendorRecovery),
    };
  });
}

export function listLaundryIncidents(orderId?: string): LaundryIncident[] {
  return incidents.filter(row => !orderId || row.orderId === orderId)
    .map(row => ({ ...row })).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function registerLaundryIncident(input: {
  orderId: string;
  itemTag?: string | null;
  incidentType: LaundryIncidentType;
  description: string;
  estimatedCustomerCompensation?: number;
  estimatedVendorRecovery?: number;
}): LaundryIncident {
  assertPermission("orders.manage");
  const order = listLaundryOrders().find(o => o.id === input.orderId && !o.deletedAt);
  if (!order || order.status === "cancelled") throw new Error("Active laundry ticket required");
  if (input.itemTag && !order.items?.some(item => item.tagCode === input.itemTag)) {
    throw new Error("Garment tag does not belong to this ticket");
  }
  if (!types.has(input.incidentType)) throw new Error("Invalid incident type");
  const description = input.description.trim();
  if (!description || description.length > 2000) throw new Error("Incident description must be 1–2000 characters");
  const customer = amount(input.estimatedCustomerCompensation ?? 0);
  const vendor = amount(input.estimatedVendorRecovery ?? 0);
  if (vendor > 0 && order.mode !== "outsourced") throw new Error("In-house ticket has no vendor recovery");
  const now = nowISO();
  const incident: LaundryIncident = {
    id: generateId(), orderId: order.id, itemTag: input.itemTag?.trim() || null,
    incidentType: input.incidentType, description, status: "open",
    estimatedCustomerCompensation: customer, estimatedVendorRecovery: vendor,
    resolutionNotes: null, createdAt: now, updatedAt: now,
  };
  incidents.push(incident);
  auditAction("laundry.incident_open", "laundry_incidents", incident.id, null, { ...incident });
  touchPersistence();
  return { ...incident };
}

export function decideLaundryIncident(input: { id: string; status: "resolved" | "rejected"; notes: string }): LaundryIncident {
  assertPermission("orders.manage");
  const incident = incidents.find(row => row.id === input.id);
  if (!incident) throw new Error("Laundry incident not found");
  if (incident.status !== "open") throw new Error("Incident already finalized");
  const notes = input.notes?.trim();
  if (!notes || notes.length > 2000) throw new Error("Resolution explanation must be 1–2000 characters");
  const before = { ...incident };
  incident.status = input.status;
  incident.resolutionNotes = notes;
  incident.updatedAt = nowISO();
  auditAction("laundry.incident_decide", "laundry_incidents", incident.id, before, { ...incident });
  touchPersistence();
  return { ...incident };
}

export const exportLaundryIncidents = (): LaundryIncident[] => listLaundryIncidents();
export function hydrateLaundryIncidents(raw: unknown): void {
  const validated = validateLaundryIncidents(raw);
  incidents.splice(0, incidents.length, ...validated);
}
