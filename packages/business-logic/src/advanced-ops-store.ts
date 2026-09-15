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
import type { DesignAsset, DesignRevision } from "./design-library";
import type { Appointment } from "./appointments";
import type { DeliveryItem } from "./delivery-logistics";
import type { OrderQualityCheck } from "./quality-control-types";

const production = new Map<string, ProductionWorkflowState>();
const rolls = new Map<string, MaterialRoll>();
const consumptions: MaterialConsumption[] = [];
const designs = new Map<string, DesignAsset>();
const revisions: DesignRevision[] = [];
const appointments = new Map<string, Appointment>();
const deliveries = new Map<string, DeliveryItem>();
const qualityChecks = new Map<string, OrderQualityCheck>();

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
  touchPersistence();
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
  const row = {
    ...input,
    plannedMeters: Math.max(0, input.plannedMeters),
    actualMeters: Math.max(0, input.actualMeters),
    unitCost: Math.max(0, input.unitCost),
  };
  consumptions.push(row);
  persist("material_consumptions", generateId(), "insert", row);
  return row;
}

export function listMaterialConsumptions(materialId?: string): MaterialConsumption[] {
  return consumptions.filter((c) => !materialId || c.materialId === materialId).map((c) => ({ ...c }));
}

export function upsertDesign(input: DesignAsset): DesignAsset {
  assertPermission("orders.manage");
  designs.set(input.id, { ...input, tags: [...input.tags] });
  persist("designs", input.id, "update", input);
  return input;
}

export function listDesigns(): DesignAsset[] {
  return [...designs.values()].map((design) => ({ ...design, tags: [...design.tags] }));
}

export function addDesignRevision(input: DesignRevision): DesignRevision {
  assertPermission("orders.manage");
  revisions.push({ ...input, snapshot: { ...input.snapshot, tags: [...input.snapshot.tags] } });
  persist("design_revisions", input.id, "insert", input);
  return input;
}

export function listDesignRevisions(designId?: string): DesignRevision[] {
  return revisions
    .filter((r) => !designId || r.designId === designId)
    .map((r) => ({ ...r, snapshot: { ...r.snapshot, tags: [...r.snapshot.tags] } }));
}

export function upsertAppointment(input: Appointment): Appointment {
  assertPermission("orders.manage");
  appointments.set(input.id, { ...input });
  persist("appointments", input.id, "update", input);
  return input;
}

export function listAppointments(from?: string, to?: string): Appointment[] {
  return [...appointments.values()]
    .filter((a) => (!from || a.startsAt >= from) && (!to || a.startsAt <= to))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function upsertDelivery(input: DeliveryItem): DeliveryItem {
  assertPermission("orders.manage");
  deliveries.set(input.id, { ...input });
  persist("deliveries", input.id, "update", input);
  return input;
}

export function listDeliveries(): DeliveryItem[] {
  return [...deliveries.values()].sort((a, b) =>
    (b.deliveredAt ?? b.dispatchedAt ?? b.promisedAt ?? "").localeCompare(a.deliveredAt ?? a.dispatchedAt ?? a.promisedAt ?? "")
  );
}

export interface StoredQualityCheck {
  orderId: string;
  check: OrderQualityCheck;
}

export function upsertQualityCheck(orderId: string, input: OrderQualityCheck): OrderQualityCheck {
  assertPermission("orders.manage");
  qualityChecks.set(orderId, { ...input, issues: [...input.issues] });
  persist("quality_checks", orderId, "update", { orderId, check: input });
  return input;
}

export function listQualityChecks(orderId?: string): StoredQualityCheck[] {
  return [...qualityChecks.entries()]
    .filter(([id]) => !orderId || id === orderId)
    .map(([id, check]) => ({ orderId: id, check: { ...check, issues: [...check.issues] } }))
    .sort((a, b) => b.check.checkedAt.localeCompare(a.check.checkedAt));
}

export interface AdvancedOpsSnapshot {
  production: ProductionWorkflowState[];
  materialRolls: MaterialRoll[];
  materialConsumptions: MaterialConsumption[];
  designs: DesignAsset[];
  designRevisions: DesignRevision[];
  appointments: Appointment[];
  deliveries: DeliveryItem[];
  qualityChecks: StoredQualityCheck[];
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
  for (const row of state.designs ?? []) designs.set(row.id, { ...row, tags: [...row.tags] });
  revisions.push(...(state.designRevisions ?? []).map((row) => ({ ...row, snapshot: { ...row.snapshot, tags: [...row.snapshot.tags] } })));
  for (const row of state.appointments ?? []) appointments.set(row.id, { ...row });
  for (const row of state.deliveries ?? []) deliveries.set(row.id, { ...row });
  for (const row of state.qualityChecks ?? []) qualityChecks.set(row.orderId, { ...row.check, issues: [...row.check.issues] });
}
