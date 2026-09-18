/**
 * Role permission enforcement (data layer — not UI-only).
 * Desktop commercial licenses can also install a runtime feature policy so
 * plan restrictions are enforced by domain mutations, not only by the UI.
 */
import type { LicenseFeatures, RoleName } from "@minarvabiz/types";

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

const PERMISSION_FEATURE: Partial<Record<Permission, keyof LicenseFeatures>> = {
  "sales.create": "sales",
  "sales.void": "sales",
  "products.manage": "inventory",
  "inventory.adjust": "inventory",
  "customers.manage": "customers",
  "orders.manage": "orders",
  "orders.assign": "orders",
  "expenses.manage": "inventory",
  "purchases.manage": "inventory",
  "staff.manage": "staff",
  "reports.view": "reports",
  "users.manage": "multiUser",
  "returns.manage": "sales",
  "payments.collect": "sales",
};

let currentRole: RoleName | null = null;
let runtimeFeaturePolicy: LicenseFeatures | null = null;

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

export function setRuntimeFeaturePolicy(features: LicenseFeatures | null) {
  runtimeFeaturePolicy = features ? { ...features } : null;
}

export function getRuntimeFeaturePolicy(): LicenseFeatures | null {
  return runtimeFeaturePolicy ? { ...runtimeFeaturePolicy } : null;
}

function featureAllowed(permission: Permission): boolean {
  if (!runtimeFeaturePolicy) return true;
  const feature = PERMISSION_FEATURE[permission];
  if (!feature) return true;
  return Boolean(runtimeFeaturePolicy[feature]);
}

export function can(permission: Permission, role?: RoleName | null): boolean {
  const effective = role !== undefined && role !== null ? role : (currentRole ?? desktopOwnerRole());
  if (!effective) return false;
  return (ROLE_PERMS[effective]?.includes(permission) ?? false) && featureAllowed(permission);
}

export function assertPermission(permission: Permission, role?: RoleName | null): void {
  const effectiveRole = role ?? currentRole ?? desktopOwnerRole();
  if (!effectiveRole || !ROLE_PERMS[effectiveRole]?.includes(permission)) {
    throw new Error(`Permission denied: ${permission} (role: ${effectiveRole ?? "unauthenticated"})`);
  }
  const feature = PERMISSION_FEATURE[permission];
  if (feature && runtimeFeaturePolicy && !runtimeFeaturePolicy[feature]) {
    throw new Error(`Feature not included in current license: ${feature}`);
  }
}
