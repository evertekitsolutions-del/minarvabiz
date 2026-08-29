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

const users: AppUser[] = [
  {
    id: "user-admin",
    email: "admin@minarvabiz.local",
    fullName: "Administrator",
    role: "admin",
    isActive: true,
    createdAt: nowISO(),
  },
];

export function listAppUsers(): AppUser[] {
  return [...users];
}

export function createAppUser(input: {
  email: string;
  fullName: string;
  role: RoleName;
}): AppUser {
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
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  u.isActive = isActive;
  touchPersistence();
  return u;
}

export function setUserRole(id: UUID, role: RoleName): AppUser | null {
  const u = users.find((x) => x.id === id);
  if (!u) return null;
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
