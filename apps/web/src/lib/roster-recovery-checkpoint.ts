/**
 * HR-004B authenticated Web checkpoint boundary.
 *
 * Uses the existing PostgreSQL current_user_authorization RPC to obtain the
 * authoritative user+organization pair. NEVER trust sessionStorage org/role,
 * JWT claims parsed in the browser, or an unverified app-provided tenant ID.
 * This module does not auto-replay recovery events or merge cross-device state.
 */
import {
  can, exportOutbox, getRemoteWriterGeneration, getSessionToken, getSessionUser,
} from "@minarvabiz/business-logic";
import { resolveOnlineAuthorization } from "./data-source";
import {
  createIndexedDbRosterRecoveryDriver,
  loadSealedRosterRecovery, saveSealedRosterRecovery,
  type RosterRecoveryDriver, type RosterRecoveryEvent, type RosterRecoveryScope,
} from "./roster-recovery-vault";

const isRoster = (type: string) => type === "staff_shift_rules" || type === "staff_roster_slots";
let driver: RosterRecoveryDriver | null = null;
function storage() {
  if (!driver) driver = createIndexedDbRosterRecoveryDriver();
  return driver;
}
async function authorizedScope(): Promise<{
  scope: RosterRecoveryScope;
  token: string;
  writerGeneration: number;
}> {
  const token = getSessionToken();
  const user = getSessionUser();
  if (!token || !user?.id || !can("staff.manage"))
    throw new Error("Authorized roster manager session is required for browser recovery");
  const generation = getRemoteWriterGeneration();
  const authority = await resolveOnlineAuthorization(token,user.id);
  if (!authority.ok) throw new Error("Roster recovery organization authorization failed");
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id ||
      getRemoteWriterGeneration() !== generation || !can("staff.manage")) {
    throw new Error("Roster recovery session changed while authorizing; do not reuse old pending events");
  }
  return {scope:{userId:user.id,organizationId:authority.orgId},token,writerGeneration:generation};
}
function ensureCurrent(identity: Awaited<ReturnType<typeof authorizedScope>>) {
  if (getSessionToken() !== identity.token ||
      getSessionUser()?.id !== identity.scope.userId ||
      getRemoteWriterGeneration() !== identity.writerGeneration || !can("staff.manage")) {
    throw new Error("Roster recovery identity changed; keep the sealed backup for manual review");
  }
}
export async function inspectSealedRosterCheckpoint(): Promise<{
  events: RosterRecoveryEvent[];
  scope: RosterRecoveryScope;
}> {
  const identity = await authorizedScope();
  const events = await loadSealedRosterRecovery(storage(),identity.scope) ?? [];
  ensureCurrent(identity);
  return {events:events.filter(e=>e.status==="pending"||e.status==="failed"),scope:identity.scope};
}

/**
 * A checkpoint of the in-memory queue must finish BEFORE any cloud RPC.
 * A prior sealed event may be removed only if its SAME event ID has been
 * explicitly confirmed synced/discarded in the shared event history.
 * This prevents a new login, truncated in-memory queue, or cross-session
 * crash from silently overwriting unrecovered browser events.
 */
export async function checkpointUnconfirmedRosterEvents(
  resolvedEventIds: readonly string[] = [],
): Promise<number> {
  const identity = await authorizedScope();
  const previous = (await loadSealedRosterRecovery(storage(),identity.scope) ?? [])
    .filter(e=>e.status==="pending"||e.status==="failed");
  ensureCurrent(identity);
  const history = exportOutbox().filter(e=>isRoster(e.aggregateType));
  const pending = history.filter(e=>e.status==="pending"||e.status==="failed");
  const pendingIds = new Set(pending.map(e=>e.id));
  const resolved = new Set(resolvedEventIds);
  for (const old of previous) {
    if (pendingIds.has(old.id)) continue;
    const evidence = history.find(e=>e.id===old.id);
    if (!resolved.has(old.id) || !evidence ||
        (evidence.status!=="synced"&&evidence.status!=="discarded")) {
      throw new Error("Previous encrypted roster events require reviewed recovery before rewriting the vault");
    }
  }
  ensureCurrent(identity);
  // Persist ONLY the current account's unconfirmed events, never historic
  // synced/discarded records from potentially unrelated previous sessions.
  await saveSealedRosterRecovery(storage(),identity.scope,pending);
  ensureCurrent(identity);
  return pending.length;
}
