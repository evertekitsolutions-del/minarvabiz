/**
 * Bridges domain stores with @minarvabiz/sync engine for Hybrid edition.
 * Online edition can swap MemoryCloudAdapter for Supabase adapter later.
 */

import {
  SyncEngine, MemoryCloudAdapter, createMemoryLocalStore,
} from "@minarvabiz/sync";
import type { UUID } from "@minarvabiz/types";
import { generateId } from "@minarvabiz/utils";

const deviceId = (typeof globalThis !== "undefined" &&
  (globalThis as { __minarvaDeviceId?: string }).__minarvaDeviceId) ||
  generateId();

if (typeof globalThis !== "undefined") {
  (globalThis as { __minarvaDeviceId?: string }).__minarvaDeviceId = deviceId;
}

const local = createMemoryLocalStore();
const adapter = new MemoryCloudAdapter();
export const syncEngine = new SyncEngine(deviceId as UUID, adapter, local);

syncEngine.registerDevice("Minarva Primary", "web");

export function getSyncSnapshot() {
  return {
    online: syncEngine.isOnline(),
    outboxStats: syncEngine.outbox.stats(),
    sessions: syncEngine.listSessions(),
    conflicts: syncEngine.listConflicts(true),
    devices: syncEngine.listDevices(),
    lastSyncAt: syncEngine.listDevices()[0]?.lastSyncAt ?? null,
  };
}

export async function runSync() {
  return syncEngine.sync();
}

export function enqueueDemoWrite() {
  const id = generateId() as UUID;
  syncEngine.writeLocal(
    "customers",
    {
      id,
      version: 1,
      updatedAt: new Date().toISOString(),
      name: "Sync demo customer",
    },
    "insert"
  );
  return id;
}

export function setSyncOnline(online: boolean) {
  syncEngine.setOnline(online);
}

export function resolveSyncConflict(id: UUID, choice: "local" | "remote") {
  return syncEngine.resolveConflictManually(id, choice);
}
