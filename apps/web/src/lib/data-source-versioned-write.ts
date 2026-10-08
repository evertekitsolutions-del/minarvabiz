import {configFromEnv,pgInsert,pgSelect,pgUpdate} from "@minarvabiz/database";

export async function optimisticVersionUpdate(
  cfg: NonNullable<ReturnType<typeof configFromEnv>>,
  table: string,
  id: string,
  newVersion: number,
  patch: Record<string, unknown>,
  label: string
): Promise<void> {
  if (!Number.isInteger(newVersion) || newVersion < 2) {
    throw new Error(`${label} update requires an incremented version`);
  }
  const expectedVersion = newVersion - 1;
  const result = await pgUpdate<Record<string, unknown>>(
    cfg,
    table,
    `id=eq.${id}&version=eq.${expectedVersion}`,
    { ...patch, version: newVersion }
  );
  if (result.error) throw new Error(result.error.message);
  if (result.data?.length) return;

  const current = await pgSelect<Record<string, unknown>>(cfg, table, `select=id,version&id=eq.${id}&limit=1`);
  if (current.error) throw new Error(current.error.message);
  const remoteVersion = Number(current.data?.[0]?.version || 0);
  if (remoteVersion === newVersion) return; // idempotent retry of an already committed update
  throw new Error(`${label} version conflict (expected ${expectedVersion}, remote ${remoteVersion || "missing"})`);
}

export async function optimisticVersionUpsert(
  cfg: NonNullable<ReturnType<typeof configFromEnv>>,
  table: string,
  id: string,
  newVersion: number,
  row: Record<string, unknown>,
  label: string
): Promise<void> {
  if (!Number.isInteger(newVersion) || newVersion < 1) {
    throw new Error(`${label} requires a positive version`);
  }
  const current = await pgSelect<Record<string, unknown>>(cfg, table, `select=id,version&id=eq.${id}&limit=1`);
  if (current.error) throw new Error(current.error.message);
  const existing = current.data?.[0];
  if (!existing) {
    const inserted = await pgInsert<Record<string, unknown>>(cfg, table, { id, ...row, version: newVersion });
    if (inserted.error) throw new Error(inserted.error.message);
    return;
  }
  const remoteVersion = Number(existing.version || 0);
  if (remoteVersion === newVersion) return; // idempotent retry
  if (newVersion < 2 || remoteVersion !== newVersion - 1) {
    throw new Error(`${label} version conflict (expected ${newVersion - 1}, remote ${remoteVersion})`);
  }
  await optimisticVersionUpdate(cfg, table, id, newVersion, row, label);
}

