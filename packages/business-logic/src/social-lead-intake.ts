/**
 * Optional social-channel lead intake boundary (MKT-004 foundation).
 * No external network, customer creation, marketing send or durable write.
 * A trusted adapter must authenticate the provider webhook and resolve
 * tenant/company/branch authorization before calling this function.
 * Original Minarva implementation; no external source copied.
 */
export type SocialLeadChannel = "facebook" | "instagram" | "whatsapp" | "website" | "other";
export interface SocialLeadIntakeInput {
  enabled: boolean;
  tenantId: string;
  companyId: string;
  branchId: string;
  channel: SocialLeadChannel;
  providerAccountId: string;
  externalLeadId: string;
  receivedAt: string;
  contact: { name?: string; email?: string; phone?: string };
  marketingOptIn?: boolean;
}
export interface TrustedSocialLeadScope {
  tenantId: string;
  companyId: string;
  allowedBranchIds: readonly string[];
  allowedProviderAccounts: readonly string[];
}
export interface SocialLeadIntakeProposal {
  kind: "social_lead_intake_proposal";
  scope: { tenantId: string; companyId: string; branchId: string };
  channel: SocialLeadChannel;
  providerAccountId: string;
  externalLeadId: string;
  idempotencyKey: string;
  receivedAt: string;
  contact: { name: string | null; email: string | null; phone: string | null };
  /** Absence of explicit consent must NEVER be inferred as permission to send. */
  marketingOptIn: boolean;
}

function canonicalId(value: string, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(label + " must be a canonical nonempty identifier");
  }
  return value;
}
function cleanName(value: string | undefined): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value !== value.trim() || value.length > 160 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error("Invalid contact name");
  }
  return value || null;
}
function cleanEmail(value: string | undefined): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value !== value.trim() || value.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Invalid contact email");
  return value.toLowerCase();
}
function cleanPhone(value: string | undefined): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(value)) throw new Error("Phone must be E.164");
  return value;
}
/**
 * Produces a side-effect-free, idempotent intake proposal. Persistence must
 * enforce a UNIQUE key within the verified tenant scope in one transaction.
 * It must NOT silently create a CRM customer or subscribe the contact.
 */
export function proposeSocialLeadIntake(
  input: SocialLeadIntakeInput, trusted: TrustedSocialLeadScope,
): SocialLeadIntakeProposal {
  if (!input || !trusted || input.enabled !== true) throw new Error("Social lead intake is disabled");
  const tenantId = canonicalId(input.tenantId, "Tenant");
  const companyId = canonicalId(input.companyId, "Company");
  const branchId = canonicalId(input.branchId, "Branch");
  const providerAccountId = canonicalId(input.providerAccountId, "Provider account");
  const externalLeadId = canonicalId(input.externalLeadId, "External lead");
  if (tenantId !== trusted.tenantId || companyId !== trusted.companyId ||
      !Array.isArray(trusted.allowedBranchIds) || !trusted.allowedBranchIds.includes(branchId) ||
      !Array.isArray(trusted.allowedProviderAccounts) ||
      !trusted.allowedProviderAccounts.includes(providerAccountId)) {
    throw new Error("Unverified lead intake scope");
  }
  const channels: readonly string[] = ["facebook", "instagram", "whatsapp", "website", "other"];
  if (!channels.includes(input.channel)) throw new Error("Unsupported lead channel");
  if (typeof input.receivedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.receivedAt) ||
      !Number.isFinite(Date.parse(input.receivedAt)) ||
      new Date(input.receivedAt).toISOString().slice(0, 19) !== input.receivedAt.slice(0, 19)) {
    throw new Error("Invalid UTC receive timestamp");
  }
  if (!input.contact || typeof input.contact !== "object") throw new Error("Contact is required");
  const contact = {
    name: cleanName(input.contact.name),
    email: cleanEmail(input.contact.email),
    phone: cleanPhone(input.contact.phone),
  };
  if (!contact.email && !contact.phone) throw new Error("Contact requires email or phone");
  if (input.marketingOptIn !== undefined && typeof input.marketingOptIn !== "boolean") {
    throw new Error("Marketing opt-in must be explicit boolean");
  }
  return {
    kind: "social_lead_intake_proposal",
    scope: { tenantId, companyId, branchId },
    channel: input.channel,
    providerAccountId,
    externalLeadId,
    idempotencyKey: JSON.stringify([tenantId, companyId, input.channel, providerAccountId, externalLeadId]),
    receivedAt: input.receivedAt,
    contact,
    marketingOptIn: input.marketingOptIn === true,
  };
}
