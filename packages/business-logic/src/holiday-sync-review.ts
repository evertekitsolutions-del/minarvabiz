import { validateHolidayCache } from "./holiday-cache";
import { previewHolidayCalendar, type HolidayCalendarContext, type HolidayDayReview, type HolidayRule } from "./holiday-calendar";

/**
 * HR-005 conservative offline/Cloud *read-only* reconciliation.
 * Cloud input must come from the current tenant's authenticated, full RLS
 * read. A locally cached row is never a replay instruction or proof that a
 * remote row was deleted. No automatic overwrite, save, sync or pay changes.
 */
export type HolidayRevisionFinding =
  | "identical"
  | "cloud_newer_review"
  | "local_newer_unverified"
  | "same_version_divergence"
  | "local_only_unverified"
  | "cloud_only_unverified";

export interface HolidayRevisionReview {
  ruleId: string;
  kind: HolidayRevisionFinding;
  localVersion: number | null;
  cloudVersion: number | null;
}

const sameContent = (a: HolidayRule,b: HolidayRule): boolean =>
  a.id===b.id && a.orgId===b.orgId && a.scope===b.scope &&
  a.countryCode===b.countryCode && a.branchId===b.branchId &&
  a.date===b.date && a.repeatsAnnually===b.repeatsAnnually &&
  a.name===b.name && a.treatment===b.treatment && a.active===b.active;

const uuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Caller has already checked current session/permissions; this pure function
 * enforces pinned tenant and valid identity for *both* snapshots as a second
 * defense. A discrepancy is ALWAYS a human/server review item.
 */
export function reviewHolidayRevisionSnapshots(input: {
  orgId: string;
  local: readonly HolidayRule[];
  cloud: readonly HolidayRule[];
}): HolidayRevisionReview[] {
  if (!input || !uuid(input.orgId))
    throw new Error("Verified organization identity required for holiday revision review");

  // Reuse the exact existing backup validator; it copies and rejects
  // malformed/duplicate/mixed-organization entries before any comparison.
  const local=validateHolidayCache(input.local);
  const cloud=validateHolidayCache(input.cloud);
  for (const row of [...local,...cloud])
    if (row.orgId!==input.orgId)
      throw new Error("Holiday snapshot organization mismatch; no comparison is authorized");

  const byLocal=new Map(local.map(row=>[row.id,row]));
  const byCloud=new Map(cloud.map(row=>[row.id,row]));
  const ids=[...new Set([...byLocal.keys(),...byCloud.keys()])].sort();
  const findings:HolidayRevisionReview[]=[];
  for (const ruleId of ids) {
    const localRow=byLocal.get(ruleId),cloudRow=byCloud.get(ruleId);
    let kind:HolidayRevisionFinding;
    if (!localRow)kind="cloud_only_unverified";
    else if (!cloudRow)kind="local_only_unverified";
    else if (localRow.version<cloudRow.version)kind="cloud_newer_review";
    else if (localRow.version>cloudRow.version)kind="local_newer_unverified";
    else kind=sameContent(localRow,cloudRow)?"identical":"same_version_divergence";
    findings.push({ruleId,kind,localVersion:localRow?.version??null,
      cloudVersion:cloudRow?.version??null});
  }
  return findings;
}

/**
 * HR-005 read-only calendar impact preflight for a human reconciliation.
 * A revision mismatch is never an instruction to hydrate, erase or replay.
 * The caller must independently authenticate and authorize both sources.
 * This function only compares the effective branch-local calendar over a
 * bounded date range; it does not make pay/attendance/roster decisions.
 */
export interface HolidayCalendarImpact {
  date: string;
  localTreatment: HolidayDayReview["treatment"];
  cloudTreatment: HolidayDayReview["treatment"];
  localHolidayIds: string[];
  cloudHolidayIds: string[];
}

export function reviewHolidayCalendarImpact(input: {
  orgId: string;
  local: readonly HolidayRule[];
  cloud: readonly HolidayRule[];
  from: string;
  to: string;
  context: HolidayCalendarContext;
}): HolidayCalendarImpact[] {
  if (!input || !uuid(input.orgId) || !input.context ||
      input.context.orgId !== input.orgId)
    throw Error("Verified matching organization context required for holiday calendar impact review");

  const local = validateHolidayCache(input.local);
  const cloud = validateHolidayCache(input.cloud);
  for (const row of [...local, ...cloud])
    if (row.orgId !== input.orgId)
      throw Error("Holiday calendar impact refused across organizations");

  // The shared calendar engine enforces real local civil dates, a maximum
  // of 366 inclusive days and explicit branch/country scope on both sides.
  const params = {from: input.from, to: input.to, context: input.context};
  const localDays = previewHolidayCalendar({...params, rules: local});
  const cloudDays = previewHolidayCalendar({...params, rules: cloud});
  const impacts: HolidayCalendarImpact[] = [];
  for (let i = 0; i < localDays.length; i++) {
    const lhs = localDays[i], rhs = cloudDays[i];
    const localHolidayIds = lhs.holidays.map(row => row.id).sort();
    const cloudHolidayIds = rhs.holidays.map(row => row.id).sort();
    if (lhs.treatment !== rhs.treatment ||
        localHolidayIds.join(",") !== cloudHolidayIds.join(","))
      impacts.push({
        date: lhs.date, localTreatment: lhs.treatment,
        cloudTreatment: rhs.treatment, localHolidayIds, cloudHolidayIds
      });
  }
  return impacts;
}
