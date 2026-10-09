/**
 * HR-004 explicit IANA timezone/DST resolver for scheduled branch-local
 * wall-clock shifts. No implicit conversion through the device timezone.
 *
 * This is a planning/time-normalization primitive, NOT statutory payroll
 * calculation or a substitute for tenant-approved country/branch policies.
 * Missing clock times (spring-forward gaps) fail closed. Repeated local clock
 * times (fall-back folds) require an explicit earlier/later policy.
 */
import { validateShiftRule, type RosterSlot, type ShiftRule } from "./workforce-roster";

export interface BranchShiftTimePolicy {
  timeZone: string; // IANA identifier, e.g. Asia/Kolkata or Europe/London
  ambiguousTime?: "reject" | "earlier" | "later";
}

export interface ResolvedShiftInstants {
  startUtc: string;
  endUtc: string;
  timeZone: string;
  overnight: boolean;
  wallMinutes: number;
  elapsedMinutes: number;
  dstAdjustmentMinutes: number;
}

function branchDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Roster workDate must be YYYY-MM-DD");
  const [y, m, d] = date.split("-").map(Number);
  if (y < 1900 || y > 9999) throw new Error("Roster date is out of range");
  const ms = Date.UTC(y, m - 1, d);
  const actual = new Date(ms);
  if (actual.getUTCFullYear() !== y || actual.getUTCMonth() !== m - 1 || actual.getUTCDate() !== d) {
    throw new Error("Roster workDate is not a real calendar date");
  }
  return ms;
}

function localParts(formatter: Intl.DateTimeFormat, utcMs: number) {
  const map = new Map(formatter.formatToParts(new Date(utcMs)).map(part => [part.type, part.value]));
  const number = (key: string) => Number(map.get(key));
  return {
    year: number("year"), month: number("month"), day: number("day"),
    hour: number("hour"), minute: number("minute"), second: number("second"),
  };
}

/**
 * Resolve one local YYYY-MM-DD HH:mm using sampled UTC offsets and then
 * verify exact round-trip against Intl. A date may map to 0, 1 or 2 actual
 * instants due to civil time transitions; do not silently normalize gaps.
 */
function resolveLocalClock(
  localDayUtc: number,
  clock: string,
  formatter: Intl.DateTimeFormat,
  kind: "start" | "end",
  ambiguity: "reject" | "earlier" | "later",
): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error("Shift clock time must be HH:mm");
  const [hour, minute] = clock.split(":").map(Number);
  const naive = localDayUtc + (hour * 60 + minute) * 60_000;
  const wanted = new Date(naive);
  const offsets = new Set<number>();
  // Wider than any actual modern UTC offset (UTC-12 to UTC+14).
  // 15-minute sampling also observes ordinary half-hour DST transitions.
  for (let probe = naive - 36 * 3600_000; probe <= naive + 36 * 3600_000; probe += 15 * 60_000) {
    const local = localParts(formatter, probe);
    const pseudoUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    offsets.add(pseudoUtc - probe);
  }
  const matches: number[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    const actual = localParts(formatter, candidate);
    if (actual.year === wanted.getUTCFullYear() &&
        actual.month === wanted.getUTCMonth() + 1 &&
        actual.day === wanted.getUTCDate() &&
        actual.hour === hour && actual.minute === minute && actual.second === 0) {
      matches.push(candidate);
    }
  }
  matches.sort((a, b) => a - b);
  if (matches.length === 0) throw new Error(`Nonexistent branch-local ${kind} time (DST gap); choose another clock time`);
  if (matches.length > 1 && ambiguity === "reject") {
    throw new Error(`Ambiguous branch-local ${kind} time (DST overlap); configure earlier/later resolution`);
  }
  return ambiguity === "later" ? matches[matches.length - 1] : matches[0];
}

export function resolveRosterShiftInstants(
  slot: Pick<RosterSlot, "workDate">,
  shift: ShiftRule,
  policy: BranchShiftTimePolicy,
): ResolvedShiftInstants {
  const { spanMinutes, overnight } = validateShiftRule(shift);
  const day = branchDate(slot.workDate);
  const zone = policy?.timeZone?.trim();
  if (!zone) throw new Error("A branch IANA timezone is required");
  const ambiguity = policy.ambiguousTime ?? "reject";
  if (!["reject", "earlier", "later"].includes(ambiguity)) throw new Error("Invalid DST ambiguity policy");
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB-u-nu-latn", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    throw new Error("Invalid branch IANA timezone");
  }
  const start = resolveLocalClock(day, shift.startTime, formatter, "start", ambiguity);
  const end = resolveLocalClock(day + (overnight ? 86400_000 : 0), shift.endTime, formatter, "end", ambiguity);
  const elapsedMinutes = (end - start) / 60_000;
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) {
    throw new Error("Resolved shift end must be later than shift start");
  }
  return {
    startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString(),
    timeZone: formatter.resolvedOptions().timeZone,
    overnight, wallMinutes: spanMinutes,
    elapsedMinutes, dstAdjustmentMinutes: elapsedMinutes - spanMinutes,
  };
}
