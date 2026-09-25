import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260925_sale_returns_production_drift_fix.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.sale_returns/i);
assert.match(sql, /org_id UUID REFERENCES public\.organizations\(id\)/i);
assert.match(sql, /ALTER TABLE public\.sale_returns ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /CREATE TRIGGER set_current_user_org_id/i);
assert.match(sql, /EXECUTE FUNCTION private\.set_current_user_org_id\(\)/i);
assert.match(sql, /DROP POLICY IF EXISTS sale_returns_auth_all/i);
assert.match(sql, /CREATE POLICY sale_returns_tenant_select/i);
assert.match(sql, /CREATE POLICY sale_returns_role_insert/i);
assert.match(sql, /CREATE POLICY sale_returns_role_update/i);
assert.match(sql, /CREATE POLICY sale_returns_role_delete/i);
assert.match(sql, /public\.user_has_org_role/i);
assert.match(sql, /'super_admin','admin','manager'/i);
assert.match(sql, /REVOKE ALL ON TABLE public\.sale_returns FROM PUBLIC, anon, authenticated, service_role/i);
assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.sale_returns TO authenticated/i);

console.log("sale_returns migration contract PASS");
