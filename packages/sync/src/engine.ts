/**
 * Sync engine — orchestrates outbox push + remote pull for Hybrid edition.
 *
 * Cloud adapter is injected so Online (Supabase) and Offline (noop/local)
 * share the same engine interface.
 */

import type {
  SyncSession, ConflictRecord, DeviceRegistration, UUID, OutboxEvent,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { Outbox } from "./outbox";
import {
  createConflict, autoResolve, manualResolve, compareVersions,
  type VersionedRecord,
} from "./conflict";
import { isFinancialTable } from "./constants";

export interface CloudAdapter {
  push(events: OutboxEvent[]): Promise<{
    accepted: UUID[];
    rejected: Array<{ id: UUID; error: string; remote?: VersionedRecord }>;
  }>;
  pull(since: string, deviceId: UUID): Promise<{
    records: Array<{ tableName: string; record: VersionedRecord }>;
    serverTime: string;
  }>;
  registerDevice?(device: DeviceRegistration): Promise<void>;
}

export interface LocalStore {
  get(tableName: string, id: UUID): VersionedRecord | null;
  upsert(tableName: string, record: VersionedRecord): void;
}

export class SyncEngine {
  readonly outbox = new Outbox();
  private conflicts: ConflictRecord[] = [];
  private sessions: SyncSession[] = [];
  private devices: DeviceRegistration[] = [];
  private lastPullAt: string | null = null;
  private online = true;

  constructor(
    private readonly deviceId: UUID,
    private readonly adapter: CloudAdapter,
    private readonly local: LocalStore
  ) {}

  setOnline(v: boolean) {
    this.online = v;
  }

  isOnline() {
    return this.online;
  }

  registerDevice(name: string, platform: DeviceRegistration["platform"]) {
    const d: DeviceRegistration = {
      id: this.deviceId,
      deviceName: name,
      platform,
      lastSyncAt: null,
      isOnline: true,
      createdAt: nowISO(),
    };
    this.devices = this.devices.filter((x) => x.id !== this.deviceId);
    this.devices.push(d);
    return d;
  }

  /** Local-first write: mutate local store + enqueue outbox */
  writeLocal(
    tableName: string,
    record: VersionedRecord,
    eventType: "insert" | "update" | "delete"
  ) {
    this.local.upsert(tableName, record);
    this.outbox.enqueue({
      aggregateType: tableName,
      aggregateId: record.id,
      eventType,
      payload: { ...record },
      deviceId: this.deviceId,
    });
  }

  listConflicts(unresolvedOnly = true): ConflictRecord[] {
    let list = [...this.conflicts];
    if (unresolvedOnly) list = list.filter((c) => !c.resolution);
    return list;
  }

  resolveConflictManually(
    conflictId: UUID,
    choice: "local" | "remote" | "merged",
    merged?: Record<string, unknown>
  ): ConflictRecord | null {
    const idx = this.conflicts.findIndex((c) => c.id === conflictId);
    if (idx < 0) return null;
    const resolved = manualResolve(this.conflicts[idx], choice, merged);
    this.conflicts[idx] = resolved;
    if (choice === "local" || choice === "merged") {
      const payload = (choice === "merged" && merged
        ? merged
        : resolved.localPayload) as VersionedRecord;
      this.local.upsert(resolved.tableName, payload);
    } else {
      this.local.upsert(resolved.tableName, resolved.remotePayload as unknown as VersionedRecord);
    }
    return resolved;
  }

  listSessions(): SyncSession[] {
    return [...this.sessions];
  }

  listDevices(): DeviceRegistration[] {
    return [...this.devices];
  }

  /**
   * Full sync cycle: push pending outbox, then pull remote changes.
   */
  async sync(): Promise<SyncSession> {
    const session: SyncSession = {
      id: generateId(),
      deviceId: this.deviceId,
      startedAt: nowISO(),
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: 0,
      status: "running",
    };
    this.sessions.unshift(session);

    if (!this.online) {
      session.status = "failed";
      session.lastError = "Device offline";
      session.finishedAt = nowISO();
      return session;
    }

    try {
      // PUSH
      const pending = this.outbox.pending(100);
      if (pending.length) {
        const result = await this.adapter.push(pending);
        this.outbox.markSynced(result.accepted);
        session.pushed = result.accepted.length;

        for (const rej of result.rejected) {
          if (rej.remote) {
            const local = this.local.get(
              pending.find((p) => p.id === rej.id)?.aggregateType ?? "",
              pending.find((p) => p.id === rej.id)?.aggregateId ?? ("" as UUID)
            );
            if (local && rej.remote) {
              const conflict = createConflict({
                tableName: pending.find((p) => p.id === rej.id)!.aggregateType,
                recordId: local.id,
                local,
                remote: rej.remote,
              });
              const auto = autoResolve(conflict);
              if (auto.winner) {
                this.conflicts.push(auto.conflict);
                if (auto.winner === "remote") {
                  this.local.upsert(conflict.tableName, rej.remote);
                }
                this.outbox.markSynced([rej.id]);
              } else {
                this.conflicts.push(auto.conflict);
                this.outbox.markConflict(rej.id);
                session.conflicts += 1;
              }
            } else {
              this.outbox.markError(rej.id, rej.error);
              session.errors += 1;
            }
          } else {
            this.outbox.markError(rej.id, rej.error);
            session.errors += 1;
          }
        }
      }

      // PULL
      const since = this.lastPullAt ?? new Date(0).toISOString();
      const pull = await this.adapter.pull(since, this.deviceId);
      for (const { tableName, record } of pull.records) {
        const existing = this.local.get(tableName, record.id);
        if (!existing) {
          this.local.upsert(tableName, record);
          session.pulled += 1;
          continue;
        }
        const cmp = compareVersions(existing, record);
        if (cmp === "remote") {
          this.local.upsert(tableName, record);
          session.pulled += 1;
        } else if (cmp === "conflict" || (cmp === "local" && isFinancialTable(tableName) === false && existing.updatedAt === record.updatedAt)) {
          // same version different content → conflict
          if (JSON.stringify(existing) !== JSON.stringify(record)) {
            const conflict = createConflict({ tableName, recordId: record.id, local: existing, remote: record });
            const auto = autoResolve(conflict);
            this.conflicts.push(auto.conflict);
            if (auto.winner === "remote") this.local.upsert(tableName, record);
            if (!auto.winner) session.conflicts += 1;
            else session.pulled += 1;
          }
        }
        // local wins → skip
      }
      this.lastPullAt = pull.serverTime;

      const dev = this.devices.find((d) => d.id === this.deviceId);
      if (dev) dev.lastSyncAt = nowISO();

      session.status = session.errors > 0 && session.pushed === 0 ? "failed" : "completed";
    } catch (err) {
      session.status = "failed";
      session.lastError = err instanceof Error ? err.message : String(err);
    }

    session.finishedAt = nowISO();
    return session;
  }
}

/** In-memory cloud adapter for tests / offline demo of sync UI */
export class MemoryCloudAdapter implements CloudAdapter {
  private server = new Map<string, VersionedRecord>(); // key: table:id

  async push(events: OutboxEvent[]) {
    const accepted: UUID[] = [];
    const rejected: Array<{ id: UUID; error: string; remote?: VersionedRecord }> = [];
    for (const e of events) {
      const key = `${e.aggregateType}:${e.aggregateId}`;
      const remote = this.server.get(key);
      const payload = e.payload as VersionedRecord;
      if (remote && remote.version > (payload.version ?? 0)) {
        rejected.push({ id: e.id, error: "version_conflict", remote });
      } else {
        this.server.set(key, { ...payload, id: e.aggregateId });
        accepted.push(e.id);
      }
    }
    return { accepted, rejected };
  }

  async pull(since: string, _deviceId: UUID) {
    const records: Array<{ tableName: string; record: VersionedRecord }> = [];
    for (const [key, record] of this.server) {
      if (record.updatedAt >= since) {
        const tableName = key.split(":")[0];
        records.push({ tableName, record });
      }
    }
    return { records, serverTime: nowISO() };
  }
}

/** No-op adapter for pure offline Windows edition */
export class OfflineAdapter implements CloudAdapter {
  async push() {
    return { accepted: [] as UUID[], rejected: [] };
  }
  async pull() {
    return { records: [], serverTime: nowISO() };
  }
}

export function createMemoryLocalStore(): LocalStore {
  const data = new Map<string, VersionedRecord>();
  return {
    get(table, id) {
      return data.get(`${table}:${id}`) ?? null;
    },
    upsert(table, record) {
      data.set(`${table}:${record.id}`, record);
    },
  };
}
