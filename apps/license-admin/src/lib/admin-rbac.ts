export type AdminRole = "viewer" | "operator" | "admin";

export type AdminPermission =
  | "license.read"
  | "license.issue"
  | "license.offline_activate"
  | "license.status_manage"
  | "customer.provision";

export const ADMIN_ROLES: readonly AdminRole[] = ["viewer", "operator", "admin"] as const;

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  viewer: new Set<AdminPermission>(["license.read"]),
  operator: new Set<AdminPermission>([
    "license.read",
    "license.issue",
    "license.offline_activate",
    "customer.provision",
  ]),
  admin: new Set<AdminPermission>([
    "license.read",
    "license.issue",
    "license.offline_activate",
    "license.status_manage",
    "customer.provision",
  ]),
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function adminRoleAllows(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function adminRoleLabel(role: AdminRole): string {
  if (role === "admin") return "Admin";
  if (role === "operator") return "Operator";
  return "Viewer";
}
