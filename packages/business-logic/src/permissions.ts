/**
 * Role permission enforcement (data layer — not UI-only).
 */
import type { RoleName } from "@minarvabiz/types";

export type Permission =
  | "sales.create"
  | "sales.void"
  | "products.manage"
  | "inventory.adjust"
  | "customers.manage"
  | "orders.manage"
  | "orders.assign"
  | "expenses.manage"
  | "purchases.manage"
  | "staff.manage"
  | "reports.view"
  | "settings.manage"
  | "users.manage"
  | "backup.manage"
  | "license.manage"
  | "returns.manage"
  | "payments.collect";

const ROLE_PERMS: Record<RoleName, Permission[]> = {
  super_admin: [
    "sales.create", "sales.void", "products.manage", "inventory.adjust", "customers.manage",
    "orders.manage", "orders.assign", "expenses.manage", "purchases.manage", "staff.manage",
    "reports.view", "settings.manage", "users.manage", "backup.manage", "license.manage",
    "returns.manage", "payments.collect",
  ],
  admin: [
    "sales.create", "sales.void", "products.manage", "inventory.adjust", "customers.manage",
    "orders.manage", "orders.assign", "expenses.manage", "purchases.manage", "staff.manage",
    "reports.view", "settings.manage", "users.manage", "backup.manage", "license.manage",
    "returns.manage", "payments.collect",
  ],
  manager: [
    "sales.create", "sales.void", "products.manage", "inventory.adjust", "customers.manage",
    "orders.manage", "orders.assign", "expenses.manage", "purchases.manage", "staff.manage",
    "reports.view", "settings.manage", "backup.manage", "returns.manage", "payments.collect",
  ],
  cashier: [
    "sales.create", "customers.manage", "payments.collect", "reports.view", "orders.manage",
  ],
  tailor: ["orders.manage", "customers.manage", "reports.view"],
  staff: ["orders.manage", "reports.view"],
};

let currentRole: RoleName | null = null;

function desktopOwnerRole(): RoleName | null {
  try {
    const candidate = (globalThis as unknown as { window?: { minarvaDesktop?: unknown } }).window;
    return candidate?.minarvaDesktop ? "super_admin" : null;
  } catch {
    return null;
  }
}

export function setCurrentRole(role: RoleName | null) {
  currentRole = role;
}

export function getCurrentRole(): RoleName | null {
  return currentRole;
}

export function can(permission: Permission, role?: RoleName | null): boolean {
  const effective = role !== undefined && role !== null ? role : (currentRole ?? desktopOwnerRole());
  if (!effective) return false;
  return ROLE_PERMS[effective]?.includes(permission) ?? false;
}

export function assertPermission(permission: Permission, role?: RoleName | null): void {
  const effectiveRole = role ?? currentRole ?? desktopOwnerRole();
  if (!effectiveRole || !can(permission, effectiveRole)) {
    throw new Error(`Permission denied: ${permission} (role: ${effectiveRole ?? "unauthenticated"})`);
  }
}
