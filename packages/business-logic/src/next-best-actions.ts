/**
 * Explainable next-best-action engine. Deterministic now; designed as the safe
 * factual layer beneath a future AI assistant.
 */

export type ActionPriority = "urgent" | "high" | "normal" | "low";
export type ActionKind = "production" | "inventory" | "customer" | "payments" | "staff" | "backup";

export interface NextBestAction {
  id: string;
  kind: ActionKind;
  priority: ActionPriority;
  title: string;
  reason: string;
  score: number;
  targetId?: string | null;
}

export interface NextBestActionInput {
  overdueOrders?: number;
  unassignedOrders?: number;
  dueTodayOrders?: number;
  outOfStockProducts?: number;
  reorderProducts?: number;
  deadStockProducts?: number;
  highRiskCustomers?: number;
  followUpCustomers?: number;
  outstandingAmount?: number;
  overdueAssignments?: number;
  overloadedStaff?: number;
  backupAgeDays?: number;
}

function count(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

export function generateNextBestActions(input: NextBestActionInput): NextBestAction[] {
  const actions: NextBestAction[] = [];
  const add = (action: Omit<NextBestAction, "score"> & { score: number }) => { if (action.score > 0) actions.push(action); };

  const overdue = count(input.overdueOrders);
  if (overdue) add({ id: "production-overdue", kind: "production", priority: "urgent", title: "Clear overdue orders", reason: `${overdue} active order${overdue === 1 ? " is" : "s are"} past the promised delivery date.`, score: 100 });
  const unassigned = count(input.unassignedOrders);
  if (unassigned) add({ id: "production-unassigned", kind: "production", priority: "high", title: "Assign unallocated jobs", reason: `${unassigned} active order${unassigned === 1 ? " is" : "s are"} waiting without a staff assignment.`, score: 88 });
  const out = count(input.outOfStockProducts);
  if (out) add({ id: "inventory-out", kind: "inventory", priority: "urgent", title: "Replenish stock-outs", reason: `${out} product${out === 1 ? " is" : "s are"} currently out of stock.`, score: 98 });
  const reorder = count(input.reorderProducts);
  if (reorder) add({ id: "inventory-reorder", kind: "inventory", priority: "high", title: "Review reorder queue", reason: `${reorder} product${reorder === 1 ? " is" : "s are"} below the calculated reorder threshold.`, score: 84 });
  const dead = count(input.deadStockProducts);
  if (dead) add({ id: "inventory-dead", kind: "inventory", priority: "normal", title: "Review dead stock", reason: `${dead} product${dead === 1 ? " has" : "s have"} no recent sales and may need a clearance decision.`, score: 55 });
  const risk = count(input.highRiskCustomers);
  if (risk) add({ id: "customer-risk", kind: "customer", priority: "high", title: "Launch customer win-back", reason: `${risk} customers are flagged as high churn risk.`, score: 82 });
  const followUp = count(input.followUpCustomers);
  if (followUp) add({ id: "customer-followup", kind: "customer", priority: "normal", title: "Work the follow-up queue", reason: `${followUp} customer follow-up opportunities are available.`, score: 64 });
  const outstanding = count(input.outstandingAmount);
  if (outstanding > 0) add({ id: "payments-outstanding", kind: "payments", priority: "high", title: "Collect outstanding balances", reason: `Outstanding customer balance is ₹${Math.round(outstanding).toLocaleString("en-IN")}.`, score: 86 });
  const overloaded = count(input.overloadedStaff);
  if (overloaded) add({ id: "staff-overload", kind: "staff", priority: "high", title: "Rebalance staff workload", reason: `${overloaded} staff member${overloaded === 1 ? " is" : "s are"} currently overloaded.`, score: 80 });
  const backupAge = count(input.backupAgeDays);
  if (backupAge >= 7) add({ id: "backup-overdue", kind: "backup", priority: "high", title: "Run a fresh backup", reason: `The last backup is approximately ${Math.floor(backupAge)} days old.`, score: 78 });

  return actions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 12);
}
