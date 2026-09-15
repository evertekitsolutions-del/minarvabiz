import type { UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { enqueueOutbox } from "./outbox-bridge";
import { touchPersistence } from "./autosave";
import {
  createProductionWorkflow,
  transitionProductionStage,
  type ProductionWorkflowState,
  type ProductionWorkflowStage,
  type ProductionStageEvent,
} from "./production-workflow";
import type { MaterialConsumption, MaterialRoll } from "./material-intelligence";

const production = new Map<UUID, ProductionWorkflowState>();
const materialRolls: MaterialRoll[] = [];
const materialConsumptions: MaterialConsumption[] = [];

export function listProductionWorkflows(): ProductionWorkflowState[] {
  return [...production.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProductionWorkflow(orderId: UUID): ProductionWorkflowState | undefined {
  return production.get(orderId);
}

export function ensureProductionWorkflow(orderId: UUID, startedAt = nowISO()): ProductionWorkflowState {
  const existing = production.get(orderId);
  if (existing) return existing;
  assertPermission("orders.manage");
  const workflow = createProductionWorkflow(orderId, startedAt);
  production.set(orderId, workflow);
  enqueueOutbox("production_workflows", orderId, "insert", workflow);
  touchPersistence();
  return workflow;
}

export function advanceProductionWorkflow(input: {
  orderId: UUID;
  to: ProductionWorkflowStage;
  changedAt?: string;
  changedBy?: string | null;
  notes?: string | null;
}): { workflow: ProductionWorkflowState | null; event: ProductionStageEvent | null; errors: string[] } {
  assertPermission("orders.manage");
  const workflow = production.get(input.orderId) ?? createProductionWorkflow(input.orderId, input.changedAt ?? nowISO());
  const result = transitionProductionStage(
    workflow,
    input.to,
    input.changedAt ?? nowISO(),
    generateId(),
    input.changedBy,
    input.notes,
  );
  if (result.errors.length) return { workflow, event: null, errors: result.errors };
  production.set(input.orderId, result.state);
  enqueueOutbox("production_workflows", input.orderId, "update", result.state);
  enqueueOutbox("production_stage_events", result.event.id, "insert", result.event);
  touchPersistence();
  return { workflow: result.state, event: result.event, errors: [] };
}

export function listMaterialRolls(materialId?: UUID): MaterialRoll[] {
  return materialRolls
    .filter((roll) => roll.active && (!materialId || roll.materialId === materialId))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function getMaterialRoll(id: UUID): MaterialRoll | undefined {
  return materialRolls.find((roll) => roll.id === id && roll.active);
}

export function createMaterialRoll(input: {
  materialId: UUID;
  batchId?: string | null;
  shadeCode?: string | null;
  widthMeters?: number | null;
  quantityMeters: number;
  costPerMeter: number;
  receivedAt?: string;
}): MaterialRoll {
  assertPermission("inventory.adjust");
  if (!input.materialId) throw new Error("Material is required");
  if (!Number.isFinite(input.quantityMeters) || input.quantityMeters <= 0) throw new Error("Quantity must be positive");
  if (!Number.isFinite(input.costPerMeter) || input.costPerMeter < 0) throw new Error("Cost per meter cannot be negative");

  const roll: MaterialRoll = {
    id: generateId(),
    materialId: input.materialId,
    batchId: input.batchId ?? null,
    shadeCode: input.shadeCode ?? null,
    widthMeters: input.widthMeters ?? null,
    quantityMeters: input.quantityMeters,
    reservedMeters: 0,
    costPerMeter: input.costPerMeter,
    receivedAt: input.receivedAt ?? nowISO(),
    active: true,
  };
  materialRolls.push(roll);
  enqueueOutbox("material_rolls", roll.id, "insert", roll);
  touchPersistence();
  return roll;
}

export function reserveMaterialRoll(id: UUID, meters: number): MaterialRoll | null {
  assertPermission("inventory.adjust");
  const roll = getMaterialRoll(id);
  const requested = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (!roll || requested <= 0) return null;
  const available = Math.max(0, roll.quantityMeters - roll.reservedMeters);
  if (requested > available) throw new Error(`Insufficient material: ${available.toFixed(2)}m available`);
  roll.reservedMeters += requested;
  enqueueOutbox("material_rolls", roll.id, "update", roll);
  touchPersistence();
  return roll;
}

export function releaseMaterialReservation(id: UUID, meters: number): MaterialRoll | null {
  assertPermission("inventory.adjust");
  const roll = getMaterialRoll(id);
  const requested = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (!roll || requested <= 0) return null;
  roll.reservedMeters = Math.max(0, roll.reservedMeters - requested);
  enqueueOutbox("material_rolls", roll.id, "update", roll);
  touchPersistence();
  return roll;
}

export function consumeMaterialFromRoll(id: UUID, meters: number, plannedMeters?: number): {
  roll: MaterialRoll | null;
  consumption: MaterialConsumption | null;
  shortage: number;
} {
  assertPermission("inventory.adjust");
  const roll = getMaterialRoll(id);
  const requested = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (!roll || requested <= 0) return { roll: null, consumption: null, shortage: requested };

  const reserved = Math.min(roll.reservedMeters, requested);
  const free = Math.max(0, roll.quantityMeters - roll.reservedMeters);
  const consumed = Math.min(requested, reserved + free);
  roll.quantityMeters = Math.max(0, roll.quantityMeters - consumed);
  roll.reservedMeters = Math.max(0, roll.reservedMeters - Math.min(roll.reservedMeters, consumed));
  if (roll.quantityMeters <= 0 && roll.reservedMeters <= 0) roll.active = false;

  const consumption: MaterialConsumption = {
    materialId: roll.materialId,
    plannedMeters: Number.isFinite(plannedMeters) ? Math.max(0, plannedMeters as number) : consumed,
    actualMeters: consumed,
    unitCost: roll.costPerMeter,
  };
  materialConsumptions.push(consumption);
  enqueueOutbox("material_rolls", roll.id, "update", roll);
  enqueueOutbox("material_consumptions", generateId(), "insert", consumption);
  touchPersistence();
  return { roll, consumption, shortage: Math.max(0, requested - consumed) };
}

export function listMaterialConsumptions(materialId?: UUID): MaterialConsumption[] {
  return materialConsumptions.filter((item) => !materialId || item.materialId === materialId);
}

export function exportPhase10State() {
  return {
    productionWorkflows: listProductionWorkflows(),
    materialRolls: [...materialRolls],
    materialConsumptions: [...materialConsumptions],
  };
}

export function hydratePhase10(data: {
  productionWorkflows?: ProductionWorkflowState[];
  materialRolls?: MaterialRoll[];
  materialConsumptions?: MaterialConsumption[];
}) {
  production.clear();
  for (const workflow of data.productionWorkflows ?? []) production.set(workflow.orderId, workflow);
  materialRolls.length = 0;
  materialRolls.push(...(data.materialRolls ?? []));
  materialConsumptions.length = 0;
  materialConsumptions.push(...(data.materialConsumptions ?? []));
}
