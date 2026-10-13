/**
 * Enqueue outbox events for every business mutation (hybrid sync).
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import type { UUID } from "@minarvabiz/types";
import type { FinancialSyncProofV1 } from "./financial-sync-contract";
import { touchPersistence } from "./autosave";

export type OutboxEventType = "insert" | "update" | "delete";

export interface LocalOutboxEvent {
  id: UUID;
  aggregateType: string;
  aggregateId: UUID;
  eventType: OutboxEventType;
  payload: unknown;
  occurredAt: string;
  deviceId: string;
  sequence: number;
  status: "pending" | "synced" | "failed" | "discarded";
  /** Verified org:user authority at enqueue time; legacy events deliberately lack it. */
  ownerScope?: string;
  /** Optional pre-operation financial provenance; absent/legacy => financially held. */
  financialSyncProof?: FinancialSyncProofV1;
  attempts: number;
  lastError: string | null;
}

const queue: LocalOutboxEvent[] = [];
let sequence = 1;
let deviceId = generateId();
let activeOutboxScope: string | null = null;

/**
 * Scope must originate from verified organization membership, never from
 * arbitrary snapshot payloads or an untrusted browser preference.
 * Unscoped legacy events are not eligible for automatic Cloud replay.
 */
export function setOutboxScope(scope: string | null): void {
  activeOutboxScope = typeof scope === "string" && /^[^\s:]+:[^\s:]+$/.test(scope) && scope.length <= 256
    ? scope
    : null;
}

export function getOutboxScope(): string | null {
  return activeOutboxScope;
}


export function setOutboxDeviceId(id: string) {
  deviceId = id;
}

export function enqueueOutbox(
  aggregateType: string,
  aggregateId: string,
  eventType: OutboxEventType,
  payload: unknown
): LocalOutboxEvent {
  const ev: LocalOutboxEvent = {
    id: generateId(),
    aggregateType,
    aggregateId: aggregateId as UUID,
    eventType,
    payload,
    occurredAt: nowISO(),
    deviceId,
    sequence: sequence++,
    status: "pending",
    ...(activeOutboxScope ? { ownerScope: activeOutboxScope } : {}),
    attempts: 0,
    lastError: null,
  };
  queue.push(ev);
  touchPersistence();
  return ev;
}

export function listPendingOutbox(): LocalOutboxEvent[] {
  return queue.filter((e) => e.status === "pending");
}

export function markOutboxSynced(ids: string[]) {
  const set = new Set(ids);
  for (const e of queue) {
    if (set.has(e.id)) e.status = "synced";
  }
  touchPersistence();
}

export function markOutboxFailed(id: string, error: string) {
  const e = queue.find((x) => x.id === id);
  if (e) {
    e.status = "failed";
    e.attempts += 1;
    e.lastError = error;
    // Persist failure metadata so retry diagnostics survive app restarts.
    touchPersistence();
  }
}

export function hydrateOutbox(events: LocalOutboxEvent[]) {
  queue.length = 0;
  queue.push(...events);
  sequence = Math.max(1, ...events.map((e) => e.sequence + 1), 1);
}

export function exportOutbox(): LocalOutboxEvent[] {
  return [...queue];
}

/** Retain superseded attendance event history after explicit human conflict resolution. */
export function discardAttendanceOutbox(aggregateId:string){
  for(const event of queue)if(event.aggregateType==="staff_attendance"&&event.aggregateId===aggregateId&&(event.status==="pending"||event.status==="failed"))event.status="discarded";
  touchPersistence();
}

/**
 * Explicit human-reviewed workforce conflict resolution only.
 * Retain immutable event payload and diagnostics for audit/backup.
 * Never mark a rejected roster event synced or delete its history.
 */
export function discardWorkforceRosterConflictEvent(eventId: string): void {
  const event = queue.find(e => e.id === eventId &&
    (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
    (e.status === "failed" || e.status === "pending"));
  if (!event) throw new Error("Unconfirmed roster event unavailable for reviewed discard");
  event.status = "discarded";
  touchPersistence();
}
