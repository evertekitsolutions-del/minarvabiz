import { assertPermission, getCurrentRole } from "./permissions";
/** App users registry (mirrors local auth users for UI) */
import type { RoleName, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { touchPersistence } from "./autosave";

export interface AppUser {
  id: UUID;
  email: string;
  fullName: string;
  role: RoleName;
  isActive: boolean;
  branchId?: UUID | null;
  createdAt: string;
}

const users: AppUser[] = [];

function assertCanManageRole(targetRole: RoleName, existingRole?: RoleName): void {
  const actorRole = getCurrentRole();
  if (actorRole !== "super_admin" && (targetRole === "super_admin" || existingRole === "super_admin")) {
    throw new Error("Only a super admin may grant or modify the super admin role");
  }
}


export function listAppUsers(): AppUser[] {
  assertPermission("users.manage");
  return [...users];
}

export function createAppUser(input: {
  email: string;
  fullName: string;
  role: RoleName;
}): AppUser {
  assertPermission("users.manage");
  assertCanManageRole(input.role);
  const u: AppUser = {
    id: generateId(),
    email: input.email.toLowerCase(),
    fullName: input.fullName,
    role: input.role,
    isActive: true,
    createdAt: nowISO(),
  };
  users.push(u);
  touchPersistence();
  return u;
}

export function setUserActive(id: UUID, isActive: boolean): AppUser | null {
  assertPermission("users.manage");
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  assertCanManageRole(u.role, u.role);
  u.isActive = isActive;
  touchPersistence();
  return u;
}

export function setUserRole(id: UUID, role: RoleName): AppUser | null {
  assertPermission("users.manage");
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  assertCanManageRole(role, u.role);
  u.role = role;
  touchPersistence();
  return u;
}

export function hydrateUsers(data: { users?: AppUser[] }) {
  if (data.users?.length) {
    users.length = 0;
    users.push(...data.users);
  }
}
