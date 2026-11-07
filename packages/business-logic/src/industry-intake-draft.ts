/**
 * Industry-specific operator intake draft, never a transaction or entitlement.
 * No patient/customer identifiers or free-form PII are stored.
 * Scope comes from authenticated workspace preference key, not form input.
 */
import { type IndustryPackId, type IndustryWorkspaceProfile, validateIndustryProfile } from "./industry-workspace-profile";
import { listIndustryWorkflowTemplates } from "./industry-workflow-templates";

export type IndustryIntakeDraft = Readonly<{
  version: 1;
  templateId: string;
  industry: IndustryPackId;
  reference: string;
  updatedAt: string;
}>;

const referencePattern = /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,63}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const scopedKeyPattern = /^minarva:industry-profile:v1:(?:demo|live):[^:]+:[^:]+$/;

export function validateIndustryIntakeDraft(
  input: unknown, profile: IndustryWorkspaceProfile, templateId: string,
): IndustryIntakeDraft {
  validateIndustryProfile(profile);
  const template = listIndustryWorkflowTemplates(profile).find(item => item.id === templateId);
  if (!template) throw new Error("Industry workflow is not selected");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid intake draft");
  const data = input as Record<string, unknown>;
  if (data.version !== 1 || data.templateId !== templateId || data.industry !== template.industry ||
      typeof data.reference !== "string" || !referencePattern.test(data.reference) ||
      typeof data.updatedAt !== "string" || !isoTimestampPattern.test(data.updatedAt) ||
      !Number.isFinite(Date.parse(data.updatedAt)) ||
      new Date(data.updatedAt).toISOString() !== data.updatedAt) {
    throw new Error("Invalid industry intake reference or timestamp");
  }
  return { version: 1, templateId, industry: template.industry, reference: data.reference, updatedAt: data.updatedAt };
}

export function industryIntakeDraftKey(preferenceKey: string, templateId: string): string {
  if (!scopedKeyPattern.test(preferenceKey) || !/^[a-z]+(?:-[a-z]+)*$/.test(templateId)) {
    throw new Error("Invalid industry draft scope");
  }
  return `${preferenceKey}:intake:${templateId}`;
}

export function saveIndustryIntakeDraft(
  storage: Pick<Storage, "setItem" | "getItem">, preferenceKey: string,
  profile: IndustryWorkspaceProfile, templateId: string, reference: string, now: string,
): IndustryIntakeDraft {
  const key = industryIntakeDraftKey(preferenceKey, templateId);
  const template = listIndustryWorkflowTemplates(profile).find(item => item.id === templateId);
  if (!template) throw new Error("Industry workflow is not selected");
  const draft = validateIndustryIntakeDraft({
    version: 1, templateId, industry: template.industry, reference, updatedAt: now,
  }, profile, templateId);
  // Do not silently replace a newer reference written in another tab.
  const previous = storage.getItem(key);
  if (previous !== null) {
    const existing = validateIndustryIntakeDraft(JSON.parse(previous), profile, templateId);
    if (Date.parse(existing.updatedAt) > Date.parse(draft.updatedAt)) {
      throw new Error("Industry intake draft has a newer saved revision");
    }
  }
  storage.setItem(key, JSON.stringify(draft));
  const readback = storage.getItem(key);
  if (readback === null) throw new Error("Draft storage did not persist");
  const persisted = validateIndustryIntakeDraft(JSON.parse(readback), profile, templateId);
  if (JSON.stringify(persisted) !== JSON.stringify(draft)) throw new Error("Draft readback mismatch");
  return persisted;
}

export function readIndustryIntakeDraft(
  storage: Pick<Storage, "getItem">, preferenceKey: string,
  profile: IndustryWorkspaceProfile, templateId: string,
): IndustryIntakeDraft | null {
  const raw = storage.getItem(industryIntakeDraftKey(preferenceKey, templateId));
  return raw === null ? null : validateIndustryIntakeDraft(JSON.parse(raw), profile, templateId);
}

/**
 * Explicitly forget an operator-local reference. Do not silently delete
 * unrelated pack drafts or another branch's data. A failed removal is surfaced
 * rather than claiming the reference has been erased.
 */
export function deleteIndustryIntakeDraft(
  storage: Pick<Storage, "getItem" | "removeItem">,
  preferenceKey: string,
  profile: IndustryWorkspaceProfile,
  templateId: string,
): boolean {
  if (!listIndustryWorkflowTemplates(profile).some(item => item.id === templateId)) {
    throw new Error("Industry workflow is not selected");
  }
  const key = industryIntakeDraftKey(preferenceKey, templateId);
  const existed = storage.getItem(key) !== null;
  storage.removeItem(key);
  if (storage.getItem(key) !== null) {
    throw new Error("Industry intake draft deletion not confirmed");
  }
  return existed;
}
