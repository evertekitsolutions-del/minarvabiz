/**
 * Offline outbox — local-first write queue for Hybrid edition.
 * Events are durable until acknowledged by cloud sync.
 */

import type { OutboxEvent, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";

export class Outbox {
  private events: OutboxEvent[] = [];
  private sequence = 0;

  enqueue(input: {
    aggregateType: string;
    aggregateId: UUID;
    eventType: string;
    payload: Record<string, unknown>;
    deviceId: UUID;
  }): OutboxEvent {
    this.sequence += 1;
    const event: OutboxEvent = {
      id: generateId(),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      occurredAt: nowISO(),
      deviceId: input.deviceId,
      sequence: this.sequence,
      status: "pending",
      attempts: 0,
      lastError: null,
    };
    this.events.push(event);
    return event;
  }

  pending(limit = 50): OutboxEvent[] {
    return this.events
      .filter((e) => e.status === "pending" || e.status === "error")
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, limit);
  }

  markSynced(ids: UUID[]): void {
    const set = new Set(ids);
    for (const e of this.events) {
      if (set.has(e.id)) {
        e.status = "synced";
        e.lastError = null;
      }
    }
  }

  markError(id: UUID, error: string): void {
    const e = this.events.find((x) => x.id === id);
    if (e) {
      e.status = "error";
      e.attempts += 1;
      e.lastError = error;
    }
  }

  markConflict(id: UUID): void {
    const e = this.events.find((x) => x.id === id);
    if (e) e.status = "conflict";
  }

  stats() {
    const all = this.events;
    return {
      total: all.length,
      pending: all.filter((e) => e.status === "pending").length,
      synced: all.filter((e) => e.status === "synced").length,
      conflict: all.filter((e) => e.status === "conflict").length,
      error: all.filter((e) => e.status === "error").length,
    };
  }

  /** Prune successfully synced events older than retention (ms). Keep conflicts. */
  prune(retentionMs = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - retentionMs;
    const before = this.events.length;
    this.events = this.events.filter((e) => {
      if (e.status !== "synced") return true;
      return new Date(e.occurredAt).getTime() > cutoff;
    });
    return before - this.events.length;
  }

  all(): OutboxEvent[] {
    return [...this.events];
  }
}
