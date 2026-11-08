/**
 * COM-002 — channel-specific public catalog publication gate.
 * Pure deterministic preflight; NOT an authorization service, storefront
 * publisher, inventory reservation, or an invoice/price authority.
 *
 * Caller MUST obtain trusted actor and merchant configuration from the
 * authenticated server/session. Never trust tenant/branch IDs from a URL.
 */
export type CatalogChannel = "web" | "social" | "marketplace";
export type CatalogPublicationDecision =
  | { allowed: true; scope: { tenantId: string; companyId: string; branchId: string; channel: CatalogChannel }; revision: number }
  | { allowed: false; reason: "module_disabled" | "channel_disabled" | "scope_mismatch" | "permission_denied" | "unpublished" | "stale_revision" | "invalid_scope" };

export interface CatalogPublicationPolicy {
  tenantId: string;
  companyId: string;
  branchId: string;
  channel: CatalogChannel;
  commerceEnabled: boolean;
  channelEnabled: boolean;
  published: boolean;
  revision: number;
}

export interface CatalogPublicationActor {
  tenantId: string;
  companyId: string;
  branchIds: readonly string[];
  permissions: readonly string[];
}

const validId = (value: string): boolean => typeof value === "string" && value.trim().length > 0 && value === value.trim();

/** Fail closed before exporting catalog rows to any external channel. */
export function authorizeCatalogPublication(
  actor: CatalogPublicationActor,
  policy: CatalogPublicationPolicy,
  expectedRevision: number,
): CatalogPublicationDecision {
  if (
    !validId(actor.tenantId) || !validId(actor.companyId) ||
    !validId(policy.tenantId) || !validId(policy.companyId) ||
    !validId(policy.branchId) ||
    !Array.isArray(actor.branchIds) || !Array.isArray(actor.permissions) ||
    !["web", "social", "marketplace"].includes(policy.channel) ||
    !Number.isSafeInteger(policy.revision) || policy.revision < 0 ||
    !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
  ) return { allowed: false, reason: "invalid_scope" };

  if (
    actor.tenantId !== policy.tenantId ||
    actor.companyId !== policy.companyId ||
    !actor.branchIds.includes(policy.branchId)
  ) return { allowed: false, reason: "scope_mismatch" };
  if (!actor.permissions.includes("commerce.catalog.publish"))
    return { allowed: false, reason: "permission_denied" };
  if (!policy.commerceEnabled) return { allowed: false, reason: "module_disabled" };
  if (!policy.channelEnabled) return { allowed: false, reason: "channel_disabled" };
  if (!policy.published) return { allowed: false, reason: "unpublished" };
  if (policy.revision !== expectedRevision) return { allowed: false, reason: "stale_revision" };

  return {
    allowed: true,
    scope: {
      tenantId: policy.tenantId,
      companyId: policy.companyId,
      branchId: policy.branchId,
      channel: policy.channel,
    },
    revision: policy.revision,
  };
}
