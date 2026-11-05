/**
 * Optional, read-only industry workflow templates. These are examples for
 * tenant administrators to evaluate, NOT enabled routes or licensed features.
 * No workflow can be activated through this module.
 */
import { INDUSTRY_PACKS, type IndustryPackId, type IndustryWorkspaceProfile, validateIndustryProfile } from "./industry-workspace-profile";

export type IndustryWorkflowTemplate = Readonly<{
  id: string;
  industry: IndustryPackId;
  label: string;
  stages: readonly string[];
}>;

const TEMPLATES: readonly IndustryWorkflowTemplate[] = [
  { id: "retail-return", industry: "retail", label: "Retail return", stages: ["requested", "inspected", "approved", "completed"] },
  { id: "wholesale-order", industry: "wholesale", label: "Wholesale order", stages: ["draft", "confirmed", "allocated", "dispatched", "delivered"] },
  { id: "restaurant-ticket", industry: "restaurant", label: "Kitchen ticket", stages: ["placed", "preparing", "ready", "served"] },
  { id: "pharmacy-dispense", industry: "pharmacy", label: "Pharmacy dispense", stages: ["requested", "verified", "dispensed"] },
  { id: "garment-variant", industry: "garments", label: "Garment variant replenishment", stages: ["requested", "approved", "received"] },
  { id: "salon-appointment", industry: "salon", label: "Salon appointment", stages: ["booked", "checked-in", "in-service", "completed"] },
  { id: "professional-engagement", industry: "professional", label: "Client engagement", stages: ["proposal", "accepted", "in-progress", "delivered"] },
  { id: "repair-job", industry: "repair", label: "Repair job", stages: ["received", "diagnosed", "approved", "in-repair", "quality-check", "handed-over"] },
  { id: "manufacturing-order", industry: "manufacturing", label: "Production order", stages: ["planned", "materials-allocated", "in-production", "quality-check", "finished"] },
  { id: "tailoring-order", industry: "tailoring", label: "Tailoring order", stages: ["measurement", "cutting", "stitching", "fitting", "delivered"] },
  { id: "laundry-ticket", industry: "laundry", label: "Laundry ticket", stages: ["received", "washing", "ironing", "quality-check", "handed-over"] },
] as const;

const validStages = /^[a-z]+(?:-[a-z]+)*$/;
const workflowIds = new Set<string>();
for (const template of TEMPLATES) {
  if (!(template.industry in INDUSTRY_PACKS) || workflowIds.has(template.id) ||
      template.stages.length < 2 || new Set(template.stages).size !== template.stages.length ||
      template.stages.some(stage => !validStages.test(stage))) {
    throw new Error("Invalid industry workflow template registry");
  }
  workflowIds.add(template.id);
}

/** A copy is returned so callers cannot mutate the shared template registry. */
export function listIndustryWorkflowTemplates(profile: IndustryWorkspaceProfile): IndustryWorkflowTemplate[] {
  const enabled = new Set(validateIndustryProfile(profile).enabled);
  return TEMPLATES.filter(template => enabled.has(template.industry)).map(template => ({
    ...template,
    stages: [...template.stages],
  }));
}

/** Advisory transition check; no workflow record, permission or stock mutation. */
export function isIndustryWorkflowTransitionAllowed(
  profile: IndustryWorkspaceProfile, templateId: string, from: string, to: string,
): boolean {
  const template = listIndustryWorkflowTemplates(profile).find(item => item.id === templateId);
  if (!template) return false;
  const index = template.stages.indexOf(from);
  return index >= 0 && template.stages[index + 1] === to;
}
