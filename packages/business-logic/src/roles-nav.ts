/** Role → allowed nav ids */
import type { RoleName } from "@minarvabiz/types";

const ALL = [
  "dashboard", "sales", "services", "laundry", "expenses", "customers",
  "staff", "reports", "sms", "settings", "backup",
] as const;

export type NavId = (typeof ALL)[number];

const ROLE_NAV: Record<RoleName, readonly NavId[]> = {
  super_admin: ALL,
  admin: ALL,
  manager: ["dashboard", "sales", "services", "laundry", "expenses", "customers", "staff", "reports", "sms", "settings"],
  cashier: ["dashboard", "sales", "customers", "sms"],
  tailor: ["dashboard", "services", "customers"],
  staff: ["dashboard", "services", "laundry"],
};

export function navAllowedForRole(role: RoleName | string | null | undefined): readonly NavId[] {
  if (!role) return ALL;
  return ROLE_NAV[role as RoleName] ?? ALL;
}

export function canAccessNav(role: RoleName | string | null | undefined, id: string): boolean {
  return (navAllowedForRole(role) as readonly string[]).includes(id);
}
