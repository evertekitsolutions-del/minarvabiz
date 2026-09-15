import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  createProductionWorkflow,
  transitionProductionStage,
  type ProductionWorkflowState,
  type ProductionWorkflowStage,
} from "./production-workflow";
import type { MaterialConsumption, MaterialRoll } from "./material-intelligence";
import type { DesignRevision, DesignRecord } from "./design-library";
import type { Appointment } from "./appointments";
import type { DeliveryRecord } from "./delivery-logistics";
import type { QualityCheck } from "./quality-control-types";

const production = new Map<string, ProductionWorkflowState>();
const rolls = new Map<string, MaterialRoll>();
const consumptions: MaterialConsumption[] = [];
const designs = new Map<string, DesignRecord>();
const revisions: DesignRevision[] = [];
const appointments = new Map<string, Appointment>();
const deliveries = new Map<string, DeliveryRecord>();
const qualityChecks = new Map<string, QualityCheck>();

function persist(tableName: string, recordId: string, operation: "insert" | "update", payload: unknown) {
  enqueueOutbox(tableName, recordId, operation, payload);
  touchPersistence();
}

export function getProductionWorkflow(orderId: string): ProductionWorkflowState | null {
  return production.get(orderId) ?? null;
}

export function listProductionWorkflows(): ProductionWorkflowState[] {
  return [...production.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function ensureProductionWorkflow(orderId: string, startedAt = nowISO()): ProductionWorkflowState {
  assertPermission("orders.manage");
  const existing = production.get(orderId);
  if (existing) return existing;
  const state = createProductionWorkflow(orderId, startedAt);
  production.set(orderId, state);
  persist("production_workflows", orderId, "insert", state);
  return state;
}

export function transitionProduction(
  orderId: string,
  to: ProductionWorkflowStage,
  changedBy?: string | null,
  notes?: string | null,
  changedAt = nowISO(),
): { state: ProductionWorkflowState | null; errors: string[] } {
  assertPermission("orders.manage");
  const current = ensureProductionWorkflow(orderId);
  const result = transitionProductionStage(current, to, changedAt, generateId(), changedBy, notes);
  if (result.errors.length) return { state: current, errors: result.errors };
  production.set(orderId, result.state);
  persist("production_workflows", orderId, "update", result.state);
  enqueueOutbox("production_stage_events", result.event.id, "insert", result.event);
  return { state: result.state, errors: [] };
}

export function listMaterialRolls(materialId?: string): MaterialRoll[] {
  const all = [...rolls.values()].filter((r) => r.active && (!materialId || r.materialId === materialId));
  return all.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function upsertMaterialRoll(input: Omit<MaterialRoll, "id"> & { id?: string }): MaterialRoll {
  assertPermission("inventory.adjust");
  const id = input.id ?? generateId();
  const roll: MaterialRoll = { ...input, id };
  rolls.set(id, roll);
  persist("material_rolls", id, input.id ? "update" : "insert", roll);
  return roll;
}

export function removeMaterialRoll(id: string): boolean {
  assertPermission("inventory.adjust");
  const roll = rolls.get(id);
  if (!roll) return false;
  const next = { ...roll, active: false };
  rolls.set(id, next);
  persist("material_rolls", id, "update", next);
  return true;
}

export function recordMaterialConsumption(input: MaterialConsumption): MaterialConsumption {
  assertPermission("inventory.adjust");
  const row = { ...input, plannedMeters: Math.max(0, input.plannedMeters), actualMeters: Math.max(0, input.actualMeters), unitCost: Math.max(0, input.unitCost) };
  consumptions.push(row);
  persist("material_consumptions", generateId(), "insert", row);
  return row;
}

export function listMaterialConsumptions(materialId?: string): MaterialConsumption[] {
  return consumptions.filter((c) => !materialId || c.materialId === materialId).map((c) => ({ ...c }));
}

export function upsertDesign(input: DesignRecord): DesignRecord {
  assertPermission("orders.manage");
  designs.set(input.id, { ...input });
  persist("designs", input.id, "update", input);
  return input;
}

export function listDesigns(): DesignRecord[] {
  return [...designs.values()];
}

export function addDesignRevision(input: DesignRevision): DesignRevision {
  assertPermission("orders.manage");
  revisions.push({ ...input });
  persist("design_revisions", input.id, "insert", input);
  return input;
}

export function listDesignRevisions(designId?: string): DesignRevision[] {
  return revisions.filter((r) => !designId || r.designId === designId).map((r) => ({ ...r }));
}

export function upsertAppointment(input: Appointment): Appointment {
  assertPermission("orders.manage");
  appointments.set(input.id, { ...input });
  persist("appointments", input.id, "update", input);
  return input;
}

export function listAppointments(from?: string, to?: string): Appointment[] {
  return [...appointments.values()].filter((a) => (!from || a.startAt >= from) && (!to || a.startAt <= to)).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function upsertDelivery(input: DeliveryRecord): DeliveryRecord {
  assertPermission("orders.manage");
  deliveries.set(input.id, { ...input });
  persist("deliveries", input.id, "update", input);
  return input;
}

export function listDeliveries(): DeliveryRecord[] {
  return [...deliveries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertQualityCheck(input: QualityCheck): QualityCheck {
  assertPermission("orders.manage");
  qualityChecks.set(input.id, { ...input });
  persist("quality_checks", input.id, "update", input);
  return input;
}

export function listQualityChecks(orderId?: string): QualityCheck[] {
  return [...qualityChecks.values()].filter((q) => !orderId || q.orderId === orderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface AdvancedOpsSnapshot {
  production: ProductionWorkflowState[];
  materialRolls: MaterialRoll[];
  materialConsumptions: MaterialConsumption[];
  designs: DesignRecord[];
  designRevisions: DesignRevision[];
  appointments: Appointment[];
  deliveries: DeliveryRecord[];
  qualityChecks: QualityCheck[];
}

export function exportAdvancedOpsState(): AdvancedOpsSnapshot {
  return {
    production: listProductionWorkflows(),
    materialRolls: listMaterialRolls(),
    materialConsumptions: listMaterialConsumptions(),
    designs: listDesigns(),
    designRevisions: listDesignRevisions(),
    appointments: listAppointments(),
    deliveries: listDeliveries(),
    qualityChecks: listQualityChecks(),
  };
}

export function hydrateAdvancedOps(state: Partial<AdvancedOpsSnapshot> | null | undefined) {
  if (!state) return;
  production.clear();
  rolls.clear();
  consumptions.length = 0;
  designs.clear();
  revisions.length = 0;
  appointments.clear();
  deliveries.clear();
  qualityChecks.clear();
  for (const row of state.production ?? []) production.set(row.orderId, { ...row, events: [...row.events] });
  for (const row of state.materialRolls ?? []) rolls.set(row.id, { ...row });
  consumptions.push(...(state.materialConsumptions ?? []).map((row) => ({ ...row })));
  for (const row of state.designs ?? []) designs.set(row.id, { ...row });
  revisions.push(...(state.designRevisions ?? []).map((row) => ({ ...row })));
  for (const row of state.appointments ?? []) appointments.set(row.id, { ...row });
  for (const row of state.deliveries ?? []) deliveries.set(row.id, { ...row });
  for (const row of state.qualityChecks ?? []) qualityChecks.set(row.id, { ...row });
}
