import { createSupabaseCloudAdapter, type workforceRoster, type RemoteWriter } from "@minarvabiz/business-logic";
type ShiftRule = workforceRoster.ShiftRule;
type RosterSlot = workforceRoster.RosterSlot;
import { configFromEnv, pgSelectAll, pgSelect, pgRpc, pgInsert, pgUpdate } from "@minarvabiz/database";
import type { OutboxEvent } from "@minarvabiz/types";

type Config = NonNullable<ReturnType<typeof configFromEnv>>;
type Row = Record<string, unknown>;
type LocalEvent = { aggregateType: string; status: string };

/** Never overwrite or expose unresolved local records during a user/tenant cloud change. */
export function ensureNoUnconfirmedRosterEvents(events: readonly LocalEvent[]): void {
  if (events.some(e => (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
                       (e.status === "pending" || e.status === "failed"))) {
    throw new Error("Unconfirmed roster changes require authorized recovery before cloud rehydration; no local data was discarded");
  }
}
function readClock(value: unknown): string {
  const text = String(value ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(text)) throw new Error("Invalid cloud shift clock");
  return text.slice(0, 5);
}
function readVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid cloud roster revision");
  return version;
}
/** Separate pure mappers make cloud row consistency verifiable without network or test tenants. */
export function mapCloudShiftRule(row: Row): ShiftRule {
  return {
    id: String(row.id), name: String(row.name), startTime: readClock(row.start_time),
    endTime: readClock(row.end_time), unpaidBreakMinutes: Number(row.unpaid_break_minutes),
    branchId: row.branch_id == null ? null : String(row.branch_id),
    active: row.active === true, version: readVersion(row.version),
  };
}
export function mapCloudRosterSlot(row: Row): RosterSlot {
  if (row.status !== "scheduled" && row.status !== "cancelled") throw new Error("Invalid cloud roster status");
  return {
    id: String(row.id), staffId: String(row.staff_id),
    shiftRuleId: String(row.shift_rule_id), branchId: row.branch_id == null ? null : String(row.branch_id),
    workDate: String(row.work_date).slice(0, 10),
    status: row.status, version: readVersion(row.version),
  };
}
/** Authenticated client only; PostgreSQL FORCE RLS + manager READ policy are authority. */
export async function loadCloudRoster(cfg: Config): Promise<{shiftRules: ShiftRule[]; rosterSlots: RosterSlot[]}> {
  if (!cfg.accessToken) throw new Error("Authenticated organization session is required for roster cloud reads");
  const [rules, slots] = await Promise.all([
    pgSelectAll<Row>(cfg, "staff_shift_rules", "select=*&order=name.asc,id.asc"),
    pgSelectAll<Row>(cfg, "staff_roster_slots", "select=*&order=work_date.asc,id.asc"),
  ]);
  if (rules.error) throw new Error("Unable to read authorized shift templates: " + rules.error.message);
  if (slots.error) throw new Error("Unable to read authorized roster assignments: " + slots.error.message);
  if (!Array.isArray(rules.data) || !Array.isArray(slots.data)) throw new Error("Cloud roster result is unavailable");
  return { shiftRules: rules.data.map(mapCloudShiftRule), rosterSlots: slots.data.map(mapCloudRosterSlot) };
}


/**
 * Authenticated, non-privileged outbox sender.
 * The existing sync adapter invokes apply_staff_roster_event with the original
 * event UUID/device sequence. Server RPC controls organization, role and audit.
 * This does not mark local events as synced; the domain flush does that only
 * after the exact event has been acknowledged.
 */
export function createRosterRemoteWriter(cfg: Config): Pick<RemoteWriter, "upsertRosterEvent"> {
  return {
    upsertRosterEvent: async (event) => {
      if (!cfg.accessToken) throw new Error("Authenticated roster write requires a valid session");
      if (!event || (event.aggregateType !== "staff_shift_rules" &&
                     event.aggregateType !== "staff_roster_slots")) throw new Error("Unexpected workforce event type");
      if (!event.id || !event.deviceId || !Number.isSafeInteger(event.sequence) || event.sequence < 1) {
        throw new Error("Workforce write needs its original immutable event identity");
      }
      const adapter = createSupabaseCloudAdapter({
        rpc: async (name,args) => {
          const result = await pgRpc<Record<string,unknown>>(cfg,name,args);
          return {data:result.data,error:result.error?.message ?? null};
        },
        select: async (table,query) => {
          const result = await pgSelect<Record<string,unknown>>(cfg,table,query);
          return {data:result.data,error:result.error?.message ?? null};
        },
        insert: async (table,row) => {
          const result = await pgInsert<Record<string,unknown>>(cfg,table,row);
          return {error:result.error?.message ?? null};
        },
        update: async (table,match,patch) => {
          const result = await pgUpdate<Record<string,unknown>>(cfg,table,match,patch);
          return {error:result.error?.message ?? null};
        },
      },event.deviceId);
      const result = await adapter.push([{...event,payload:event.payload as Record<string,unknown>} as OutboxEvent]);
      const rejection = result.rejected.find(item => item.id === event.id);
      if (rejection) throw new Error(rejection.error || "Roster event was rejected by tenant authority");
      if (!result.accepted.includes(event.id)) throw new Error("Roster RPC did not acknowledge the original event ID");
    },
  };
}
