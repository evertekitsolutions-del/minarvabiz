/**
 * Production schema index — all domain table groups.
 * Wire Drizzle migrations per edition (Postgres vs SQLite) from these markers.
 */
export const SCHEMA_PHASES = [
  "core",
  "commerce",
  "orders",
  "phase5",
  "phase6",
  "phase7",
  "sync",
  "phase9",
] as const;
