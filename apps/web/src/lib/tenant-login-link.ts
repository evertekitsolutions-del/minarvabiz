/** A tenant URL locates the organization; it is never an authentication credential. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantLoginHref(orgId: string): string {
  if (!UUID.test(orgId)) throw new Error("A verified organization ID is required");
  return "/login?tenant=" + encodeURIComponent(orgId.toLowerCase());
}

/** Only an authoritative membership result may be compared with the requested tenant. */
export function matchesRequestedTenant(requested: string | null, authorizedOrgId: string): boolean {
  return requested === null || (UUID.test(requested) && UUID.test(authorizedOrgId) &&
    requested.toLowerCase() === authorizedOrgId.toLowerCase());
}
