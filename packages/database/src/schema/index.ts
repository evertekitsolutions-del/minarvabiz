/** Phase 1 logical schema foundation — dialect adapters in later phases */
export const IDENTITY_TABLES = ["users","roles","permissions","role_permissions","user_roles","branches"] as const;
export const LICENSING_TABLES = ["licenses","license_activations","devices"] as const;
export const SYSTEM_TABLES = ["settings","audit_logs","sync_queue"] as const;
export const COMMON_COLUMNS = {
  id: "uuid primary key", createdAt: "timestamptz not null", updatedAt: "timestamptz not null",
  deletedAt: "timestamptz nullable", version: "integer not null default 1",
  deviceId: "uuid nullable", branchId: "uuid nullable",
} as const;
