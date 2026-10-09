import { createSupabaseCloudAdapter, workforceRoster, type RemoteWriter } from "@minarvabiz/business-logic";
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
/** Fail closed on corrupt/unscoped cloud identities instead of coercing null to "null". */
function readIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid cloud " + field);
  return value;
}
function readBranchId(value: unknown): string | null {
  return value === null ? null : readIdentity(value, "branch ID");
}
function readWorkDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid cloud roster work date");
  }
  const [year,month,day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) {
    throw new Error("Invalid cloud roster work date");
  }
  return value;
}
function readVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid cloud roster revision");
  return version;
}
/** Separate pure mappers make cloud row consistency verifiable without network or test tenants. */
export function mapCloudShiftRule(row: Row): ShiftRule {
  // PostgreSQL invariants are checked again at the browser hydration boundary.
  // Malformed responses must not become editable domain state or appear in CSV.
  if (typeof row.name !== "string" || !row.name.trim()) throw new Error("Invalid cloud shift name");
  if (typeof row.active !== "boolean") throw new Error("Invalid cloud shift active flag");
  if (!Number.isSafeInteger(row.unpaid_break_minutes)) throw new Error("Invalid cloud shift break");
  const shift: ShiftRule = {
    id: readIdentity(row.id, "shift ID"), name: row.name, startTime: readClock(row.start_time),
    endTime: readClock(row.end_time), unpaidBreakMinutes: row.unpaid_break_minutes as number,
    branchId: readBranchId(row.branch_id),
    active: row.active, version: readVersion(row.version),
  };
  workforceRoster.validateShiftRule(shift);
  return shift;
}
export function mapCloudRosterSlot(row: Row): RosterSlot {
  if (row.status !== "scheduled" && row.status !== "cancelled") throw new Error("Invalid cloud roster status");
  return {
    id: readIdentity(row.id, "roster ID"), staffId: readIdentity(row.staff_id, "staff ID"),
    shiftRuleId: readIdentity(row.shift_rule_id, "shift ID"), branchId: readBranchId(row.branch_id),
    workDate: readWorkDate(row.work_date),
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
  const shiftRules = rules.data.map(mapCloudShiftRule);
  const rosterSlots = slots.data.map(mapCloudRosterSlot);
  const shiftById = new Map(shiftRules.map(shift => [shift.id, shift]));
  if (shiftById.size !== shiftRules.length || new Set(rosterSlots.map(slot => slot.id)).size !== rosterSlots.length) {
    throw new Error("Duplicate cloud roster identities; refusing partial hydration");
  }
  for (const slot of rosterSlots) {
    const shift = shiftById.get(slot.shiftRuleId);
    if (!shift || (shift.branchId !== null && shift.branchId !== slot.branchId)) {
      throw new Error("Cloud roster references an unavailable or mismatched shift template");
    }
  }
  return { shiftRules, rosterSlots };
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
