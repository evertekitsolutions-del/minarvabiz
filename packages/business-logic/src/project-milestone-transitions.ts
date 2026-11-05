/**
 * PRJ-003 — industry-neutral, tenant/branch scoped project milestone transitions.
 * Original Minarva Biz implementation; no third-party code or runtime dependency.
 * The caller must persist the returned next record with compare-and-swap on revision.
 * No accounting, invoice or payroll posting occurs here.
 */
export type MilestoneStatus = "planned" | "in_progress" | "blocked" | "completed" | "cancelled";
export interface ProjectMilestone {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly projectId: string;
  readonly title: string;
  readonly dueDate: string;
  readonly status: MilestoneStatus;
  readonly revision: number;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}
export interface MilestoneTransition {
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly projectId: string;
  readonly milestoneId: string;
  readonly expectedRevision: number;
  readonly nextStatus: MilestoneStatus;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason?: string;
  /** Host must verify this grant against authoritative RBAC, never user-supplied UI input. */
  readonly authorized: boolean;
}
export interface MilestoneTransitionResult {
  readonly milestone: ProjectMilestone;
  readonly audit: {
    readonly actorId: string;
    readonly milestoneId: string;
    readonly projectId: string;
    readonly from: MilestoneStatus;
    readonly to: MilestoneStatus;
    readonly occurredAt: string;
    readonly reason: string;
    readonly revision: number;
  };
}
const transitions: Record<MilestoneStatus, readonly MilestoneStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};
const idValid = (value: string): boolean =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(value);
const timestampValid = (value: string): boolean => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === new Date(date.getTime()).toISOString() &&
    date.toISOString().slice(0,19) === value.slice(0,19);
};
export function transitionProjectMilestone(
  current: ProjectMilestone,
  input: MilestoneTransition,
): MilestoneTransitionResult {
  if (!input.authorized) throw new Error("Milestone transition requires authorized project role");
  for (const id of [current.id, current.tenantId, current.companyId, current.branchId,
    current.projectId, input.actorId]) {
    if (!idValid(id)) throw new Error("Invalid milestone scope or actor identifier");
  }
  if (current.tenantId !== input.tenantId || current.companyId !== input.companyId ||
      current.branchId !== input.branchId || current.projectId !== input.projectId ||
      current.id !== input.milestoneId) throw new Error("Milestone outside authorized project scope");
  if (!Number.isSafeInteger(current.revision) || current.revision < 0 ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision !== current.revision) throw new Error("Stale milestone revision");
  if (!Object.prototype.hasOwnProperty.call(transitions, current.status) ||
      !transitions[current.status].includes(input.nextStatus)) {
    throw new Error("Invalid milestone status transition");
  }
  if (!timestampValid(current.updatedAt) || !timestampValid(input.occurredAt) ||
      Date.parse(input.occurredAt) < Date.parse(current.updatedAt)) {
    throw new Error("Milestone transition timestamp is invalid or stale");
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length > 500 || (input.nextStatus === "cancelled" && !reason)) {
    throw new Error("Cancellation requires a reason of at most 500 characters");
  }
  if (current.revision === Number.MAX_SAFE_INTEGER) throw new Error("Milestone revision overflow");
  const revision = current.revision + 1;
  const milestone: ProjectMilestone = {
    ...current, status: input.nextStatus, revision, updatedAt: input.occurredAt,
    completedAt: input.nextStatus === "completed" ? input.occurredAt : null,
  };
  return {milestone, audit: {
    actorId: input.actorId, milestoneId: current.id, projectId: current.projectId,
    from: current.status, to: input.nextStatus, occurredAt: input.occurredAt, reason, revision,
  }};
}
