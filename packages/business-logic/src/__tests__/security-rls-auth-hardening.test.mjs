import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL("../../../../supabase/migrations/20260924_security_rls_role_auth_hardening.sql", import.meta.url),
  "utf8"
);
const appLayout = fs.readFileSync(
  new URL("../../../../apps/web/src/components/AppLayoutClient.tsx", import.meta.url),
  "utf8"
);

assert.match(migration, /right\(policyname, 9\) = '_auth_all'/);
assert.match(migration, /DROP POLICY IF EXISTS %I ON %I\.%I/);

assert.match(migration, /profiles_update_own/);
assert.match(migration, /WITH CHECK \(\(SELECT auth\.uid\(\)\) = id\)/);
assert.match(migration, /REVOKE UPDATE ON TABLE public\.profiles FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT UPDATE \(full_name\) ON public\.profiles TO authenticated/);

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.user_has_org_role/);
assert.match(migration, /public\.organization_members/);
assert.match(migration, /om\.role = ANY \(allowed_roles\)/);
assert.match(migration, /'accounts','journal_entries','journal_entry_lines'/);
assert.match(migration, /'sales','sale_items','payments','cash_register_sessions','quotations'/);

assert.match(appLayout, /process\.env\.NODE_ENV === "production"/);
assert.match(appLayout, /process\.env\.NEXT_PUBLIC_REQUIRE_AUTH !== "false"/);
assert.match(appLayout, /<AuthGate requireAuth=\{requireAuthByDefault\}>/);
assert.match(appLayout, /const runtimeMode = getRuntimeMode\(\)/);
assert.ok(
  /if \(runtimeMode !== "demo"\) \{/.test(appLayout)
  || /if \(getRuntimeMode\(\) === "demo"\) return;/.test(appLayout),
  "demo mode must remain isolated from Supabase hydration"
);
assert.doesNotMatch(
  appLayout,
  /<AuthGate requireAuth=\{process\.env\.NEXT_PUBLIC_REQUIRE_AUTH === "true"\}>/
);

console.log("security RLS/auth hardening contract tests passed");
