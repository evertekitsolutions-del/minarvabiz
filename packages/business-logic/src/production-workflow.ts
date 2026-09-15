/**
 * Production workflow engine for tailoring/boutique operations.
 * Pure, deterministic rules shared by desktop/web/mobile surfaces.
 */

export type ProductionWorkflowStage =
  | "received"
  | "cutting"
  | "stitching"
  | "embroidery"
  | "printing"
  | "finishing"
  | "ironing"
  | "qc"
  | "rework"
  | "packing"
  | "ready_to_deliver"
  | "delivered"
  | "cancelled";

export interface ProductionStageEvent {
  id: string;
  orderId: string;
  from: ProductionWorkflowStage | null;
  to: ProductionWorkflowStage;
  changedAt: string;
  changedBy?: string | null;
  notes?: string | null;
}

export interface ProductionWorkflowState {
  orderId: string;
  stage: ProductionWorkflowStage;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  reworkCount: number;
  events: ProductionStageEvent[];
}

const STAGE_ORDER: ProductionWorkflowStage[] = [
  "received",
  "cutting",
  "stitching",
  "embroidery",
  "printing",
  "finishing",
  "ironing",
  "qc",
  "packing",
  "ready_to_deliver",
  "delivered",
];

const PARALLEL_OPTIONAL_STAGES = new Set<ProductionWorkflowStage>(["embroidery", "printing"]);

export function canTransitionProductionStage(
  from: ProductionWorkflowStage,
  to: ProductionWorkflowStage,
): boolean {
  if (from === "cancelled" || from === "delivered") return false;
  if (to === "cancelled") return true;
  if (to === "rework") return from === "qc";
  if (from === "rework") return to === "stitching" || to === "finishing" || to === "qc";
  if (from === to) return true;

  const fromIndex = STAGE_ORDER.indexOf(from);
  const toIndex = STAGE_ORDER.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return false;

  // Optional decorative/printing stages may be inserted immediately after stitching.
  if (PARALLEL_OPTIONAL_STAGES.has(to)) return from === "stitching";
  if (from === "embroidery" || from === "printing") return to === "finishing";
  return toIndex === fromIndex + 1;
}

export function transitionProductionStage(
  state: ProductionWorkflowState,
  to: ProductionWorkflowStage,
  changedAt: string,
  eventId: string,
  changedBy?: string | null,
  notes?: string | null,
): { state: ProductionWorkflowState; event: ProductionStageEvent; errors: string[] } {
  if (!Number.isFinite(Date.parse(changedAt))) {
    return { state, event: null as unknown as ProductionStageEvent, errors: ["Invalid transition timestamp"] };
  }
  if (!canTransitionProductionStage(state.stage, to)) {
    return { state, event: null as unknown as ProductionStageEvent, errors: [`Invalid production transition: ${state.stage} → ${to}`] };
  }

  const event: ProductionStageEvent = {
    id: eventId,
    orderId: state.orderId,
    from: state.stage,
    to,
    changedAt,
    changedBy: changedBy ?? null,
    notes: notes ?? null,
  };

  const reworkCount = to === "rework" ? state.reworkCount + 1 : state.reworkCount;
  const next: ProductionWorkflowState = {
    ...state,
    stage: to,
    updatedAt: changedAt,
    completedAt: to === "delivered" || to === "cancelled" ? changedAt : state.completedAt ?? null,
    reworkCount,
    events: [...state.events, event],
  };

  return { state: next, event, errors: [] };
}

export function createProductionWorkflow(
  orderId: string,
  startedAt: string,
): ProductionWorkflowState {
  return {
    orderId,
    stage: "received",
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
    reworkCount: 0,
    events: [],
  };
}

export function workflowProgress(stage: ProductionWorkflowStage): number {
  if (stage === "cancelled") return 0;
  if (stage === "rework") return 70;
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  return Math.round((index / (STAGE_ORDER.length - 1)) * 100);
}

export function productionWorkflowStageLabels(): Record<ProductionWorkflowStage, string> {
  return {
    received: "Received",
    cutting: "Cutting",
    stitching: "Stitching",
    embroidery: "Embroidery",
    printing: "Printing",
    finishing: "Finishing",
    ironing: "Ironing",
    qc: "Quality Check",
    rework: "Rework",
    packing: "Packing",
    ready_to_deliver: "Ready to Deliver",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
}
