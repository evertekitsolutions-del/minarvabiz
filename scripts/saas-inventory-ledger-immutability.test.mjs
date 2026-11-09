import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20261109_saas_tenant_ledger_privilege_lockdown.sql",
  "utf8",
);

test("authenticated tenant inventory ledger is append-only", () => {
  assert.match(sql, /DROP POLICY IF EXISTS inventory_transactions_role_delete/);
  assert.match(sql, /DROP POLICY IF EXISTS inventory_transactions_role_update/);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.inventory_transactions FROM anon, authenticated/);
});

test("ordinary and future public tables never grant TRUNCATE to client roles", () => {
  assert.match(sql, /c\.relkind IN \('r', 'p'\)/);
  assert.match(sql, /REVOKE TRUNCATE ON TABLE %s FROM anon, authenticated/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated/);
});
