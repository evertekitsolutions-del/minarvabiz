import type { MeasurementFields, MeasurementProfile, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";

/**
 * Build a new measurement revision without mutating the previous profile.
 * Existing profiles remain valid for historical orders and audits.
 */
export function createMeasurementRevision(input: {
  customerId: UUID;
  label: string;
  fields: MeasurementFields;
  notes?: string | null;
  previous?: MeasurementProfile | null;
}): MeasurementProfile {
  const previous = input.previous ?? null;
  return {
    id: generateId(),
    customerId: input.customerId,
    label: input.label || previous?.label || "Default",
    fields: input.fields,
    notes: input.notes ?? null,
    recordedAt: nowISO(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: (previous?.version ?? 0) + 1,
    previousProfileId: previous?.id ?? null,
  };
}

/**
 * Return the newest revision for a label while retaining deterministic ordering.
 * Legacy profiles without revision metadata are treated as version 1.
 */
export function latestMeasurementRevision(
  profiles: MeasurementProfile[],
  label: string
): MeasurementProfile | null {
  const matching = profiles.filter((profile) => profile.label === label && !profile.deletedAt);
  if (matching.length === 0) return null;
  return [...matching].sort((a, b) => {
    const versionDelta = (b.version ?? 1) - (a.version ?? 1);
    return versionDelta || b.recordedAt.localeCompare(a.recordedAt);
  })[0] ?? null;
}

/**
 * Follow previousProfileId links to expose the complete measurement history.
 * Broken links are tolerated so legacy/imported data can still be displayed.
 */
export function measurementRevisionHistory(
  profiles: MeasurementProfile[],
  latest: MeasurementProfile
): MeasurementProfile[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const history: MeasurementProfile[] = [];
  const seen = new Set<UUID>();
  let current: MeasurementProfile | undefined = latest;

  while (current && !seen.has(current.id)) {
    history.push(current);
    seen.add(current.id);
    current = current.previousProfileId ? byId.get(current.previousProfileId) : undefined;
  }

  return history;
}
