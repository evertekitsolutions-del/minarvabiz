/** Durable financial-sync identity; independent of licensing identity. */
export type SyncDeviceId = string;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isSyncDeviceId(value: unknown): value is SyncDeviceId {
  return typeof value === "string" && UUID.test(value);
}
export interface SyncDevicePersistence {
  read(): Promise<SyncDeviceId | null>;
  /** Must durably persist or throw; reuse this adapter instance per storage scope. */
  write(id: SyncDeviceId): Promise<void>;
}
export type PersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "persistence_failed" | "persistence_corrupt"; message: string };
const flights = new WeakMap<SyncDevicePersistence, Promise<PersistenceResult<SyncDeviceId>>>();
export function generateSyncDeviceId(): SyncDeviceId {
  return globalThis.crypto.randomUUID();
}
/** Single-flight per adapter. The adapter must enforce cross-process exclusivity. */
export function getOrCreateSyncDeviceId(
  persistence: SyncDevicePersistence,
  generate: () => string = generateSyncDeviceId,
): Promise<PersistenceResult<SyncDeviceId>> {
  const pending = flights.get(persistence);
  if (pending) return pending;
  // Defer execution until the flight is registered, including synchronous throws.
  const task = Promise.resolve().then(async (): Promise<PersistenceResult<SyncDeviceId>> => {
    try {
      const existing = await persistence.read();
      if (existing !== null) {
        return isSyncDeviceId(existing)
          ? { ok: true, value: existing }
          : { ok: false, code: "persistence_corrupt", message: "Stored sync identity is invalid" };
      }
      const created = generate();
      if (!isSyncDeviceId(created)) throw new Error("Invalid generated sync identity");
      await persistence.write(created);
      return { ok: true, value: created };
    } catch {
      return { ok: false, code: "persistence_failed", message: "Unable to persist sync identity" };
    }
  });
  const flight = task.finally(() => {
    if (flights.get(persistence) === flight) flights.delete(persistence);
  });
  flights.set(persistence, flight);
  return flight;
}
