/**
 * Storage-agnostic transactional boundary for optional industry workflows.
 * The adapter must authenticate the actor and implement the entire callback
 * in one durable transaction with tenant/branch isolation and a revision CAS.
 * This function never treats browser-local profile selection as authorization.
 */
import { type IndustryWorkspaceProfile } from "./industry-workspace-profile";
import { type IndustryWorkflowAccess, preflightAuthorizedIndustryWorkflowBatch } from "./industry-workflow-access";
import { type IndustryWorkflowEvent, type IndustryWorkflowRecord } from "./industry-workflow-reducer";

export type IndustryWorkflowTransaction = Readonly<{
  record: IndustryWorkflowRecord;
  events: readonly IndustryWorkflowEvent[];
  access: IndustryWorkflowAccess;
}>;

export type IndustryWorkflowCommitPort = Readonly<{
  /**
   * Must atomically check the expected revision, insert all events with unique
   * (tenant, branch, record, eventId), and update the record. Roll back on
   * any failure. Never invoke this from an untrusted renderer.
   */
  commit(input: Readonly<{
    original: IndustryWorkflowRecord;
    next: IndustryWorkflowRecord;
    events: readonly IndustryWorkflowEvent[];
    access: IndustryWorkflowAccess;
  }>): Promise<IndustryWorkflowRecord>;
}>;

/**
 * Verify the durable log before committing; no success is reported until the
 * adapter returns a persisted record matching the complete expected state.
 */
export async function commitAuthorizedIndustryWorkflowBatch(
  profile: IndustryWorkspaceProfile,
  transaction: IndustryWorkflowTransaction,
  port: IndustryWorkflowCommitPort,
): Promise<IndustryWorkflowRecord> {
  if (!transaction || !port || typeof port.commit !== "function") {
    throw new Error("Trusted industry workflow storage required");
  }
  const { record, events, access } = transaction;
  if (!record || !Array.isArray(events) || !access) {
    throw new Error("Invalid industry workflow transaction");
  }
  // Validate that persisted event history agrees with the supplied snapshot.
  // An adapter must load the history and record under the same database lock.
  const next = preflightAuthorizedIndustryWorkflowBatch(profile, record, events, access);
  // Capture the expected acknowledgement before crossing an untrusted adapter boundary.\n  // A buggy adapter must not mutate the expected state to manufacture success.\n  const expected = { ...next, appliedEventIds: [...next.appliedEventIds] };\n  const persisted = await port.commit({ original: record, next, events, access });
  if (!persisted || persisted.id !== expected.id ||
      persisted.tenantId !== expected.tenantId ||
      persisted.branchId !== expected.branchId ||
      persisted.templateId !== expected.templateId ||
      persisted.stage !== expected.stage ||
      persisted.revision !== expected.revision ||
      !Array.isArray(persisted.appliedEventIds) ||
      persisted.appliedEventIds.length !== expected.appliedEventIds.length ||
      persisted.appliedEventIds.some((id, i) => id !== expected.appliedEventIds[i])) {
    throw new Error("Industry workflow storage acknowledgement mismatch");
  }
  return persisted;
}
