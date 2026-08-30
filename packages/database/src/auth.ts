/**
 * Local authentication foundation (Offline + Hybrid).
 * Online edition can use Supabase Auth; this module stays for desktop.
 *
 * Password hashing uses Web Crypto PBKDF2 — no Node-only APIs required
 * for shared package compatibility.
 */

import { generateId, nowISO, sha256 } from "@minarvabiz/utils";
import type { RoleName, UUID } from "@minarvabiz/types";

export interface AuthUser {
  id: UUID;
  email: string;
  fullName: string;
  role: RoleName;
  isActive: boolean;
  branchId?: UUID | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: UUID;
  userId: UUID;
  token: string;
  expiresAt: string;
  createdAt: string;
}

const USERS_KEY = "minarva_offline_auth_users_v1";
const users: AuthUser[] = [];
const sessions: AuthSession[] = [];

function loadUsers(): void {
  if (typeof localStorage === "undefined" || users.length) return;
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) users.push(...parsed as AuthUser[]);
  } catch {
    // Corrupt auth metadata is treated as no users; business data is unaffected.
  }
}

function persistUsers(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function hasLocalUsers(): boolean {
  loadUsers();
  return users.length > 0;
}

async function pbkdf2Hash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hash = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pbkdf2:100000:${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = parts[2];
  const next = await pbkdf2Hash(password, salt);
  return next === stored;
}

export async function registerUser(input: {
  email: string;
  fullName: string;
  password: string;
  role?: RoleName;
}): Promise<{ user: AuthUser | null; error?: string }> {
  loadUsers();
  if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    return { user: null, error: "Email already registered" };
  }
  if (input.password.length < 8) {
    return { user: null, error: "Password must be at least 8 characters" };
  }
  const salt = generateId().replace(/-/g, "").slice(0, 16);
  const passwordHash = await pbkdf2Hash(input.password, salt);
  const user: AuthUser = {
    id: generateId(),
    email: input.email.toLowerCase(),
    fullName: input.fullName,
    role: input.role ?? "admin",
    isActive: true,
    passwordHash,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  users.push(user);
  persistUsers();
  return { user };
}

export async function login(
  email: string,
  password: string,
  expiresInDays = 7
): Promise<{ session: AuthSession | null; user: AuthUser | null; error?: string }> {
  loadUsers();
  const user = users.find((u) => u.email === email.toLowerCase() && u.isActive);
  if (!user) return { session: null, user: null, error: "Invalid credentials" };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { session: null, user: null, error: "Invalid credentials" };

  const token = await sha256(`${user.id}:${generateId()}:${Date.now()}`);
  const expires = new Date();
  expires.setDate(expires.getDate() + expiresInDays);
  const session: AuthSession = {
    id: generateId(),
    userId: user.id,
    token,
    expiresAt: expires.toISOString(),
    createdAt: nowISO(),
  };
  sessions.push(session);
  return { session, user };
}

export function validateSession(token: string): AuthUser | null {
  loadUsers();
  const session = sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return users.find((u) => u.id === session.userId && u.isActive) ?? null;
}

export function logout(token: string): void {
  const idx = sessions.findIndex((s) => s.token === token);
  if (idx >= 0) sessions.splice(idx, 1);
}

export function listUsers(): Omit<AuthUser, "passwordHash">[] {
  loadUsers();
  return users.map(({ passwordHash: _, ...rest }) => rest);
}

/**
 * Backwards-compatible helper. Production must never create a predictable
 * administrator account. The first administrator is created explicitly by
 * the setup screen.
 */
export async function ensureDefaultAdmin(): Promise<AuthUser | null> {
  loadUsers();
  return users.find((u) => u.role === "admin" && u.isActive) ?? null;
}

export async function createInitialAdmin(input: {
  email: string;
  fullName: string;
  password: string;
}): Promise<{ user: AuthUser | null; error?: string }> {
  loadUsers();
  if (users.length > 0) return { user: null, error: "Initial setup has already been completed" };
  return registerUser({ ...input, role: "admin" });
}
