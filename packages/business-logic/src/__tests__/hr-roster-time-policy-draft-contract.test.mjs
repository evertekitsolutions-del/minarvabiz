import assert from "node:assert/strict";
import fs from "node:fs";

const migration="20261010_hr_roster_time_policy_drafts.sql";
const sql=fs.readFileSync("supabase/migrations/"+migration,"utf8");
const order=fs.readFileSync("supabase/MIGRATION_ORDER.txt","utf8")
  .trim().split(/\r?\n/).filter(x=>x&&!x.startsWith("#"));
assert.equal(order.filter(x=>x===migration).length,1);
assert.ok(order.indexOf(migration)>order.indexOf("20261010_hr_roster_iana_time_resolution.sql"),
  "Draft policy schema must follow the validated IANA instant resolver");
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.staff_roster_time_policies/);
assert.match(sql,/REFERENCES public\.organizations\(id\)/);
assert.match(sql,/REFERENCES public\.branches\(id\)/);
assert.match(sql,/REFERENCES auth\.users\(id\)/);
assert.match(sql,/CONSTRAINT roster_policy_natural_key UNIQUE \(org_id,branch_id,effective_from\)/);
assert.match(sql,/status TEXT NOT NULL DEFAULT 'draft' CHECK \(status='draft'\)/);
assert.match(sql,/minimum_rest_minutes BETWEEN 0 AND 10080/);
assert.match(sql,/ALTER TABLE public\.staff_roster_time_policies ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/ALTER TABLE public\.staff_roster_time_policies FORCE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON public\.staff_roster_time_policies FROM PUBLIC, anon, authenticated/);
assert.match(sql,/GRANT SELECT ON public\.staff_roster_time_policies TO authenticated/);
assert.doesNotMatch(sql,/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.staff_roster_time_policies TO authenticated/i);
assert.match(sql,/public\.user_has_org_role/);
assert.match(sql,/public\.branches b/);
assert.match(sql,/NEW\.org_id IS DISTINCT FROM OLD\.org_id/);
assert.match(sql,/NEW\.effective_from IS DISTINCT FROM OLD\.effective_from/);
assert.match(sql,/NEW\.version <> OLD\.version\+1/);
assert.match(sql,/pg_catalog\.pg_timezone_names WHERE name=NEW\.iana_zone/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.save_staff_roster_time_policy_draft/);
assert.match(sql,/SECURITY DEFINER/);
assert.match(sql,/SET search_path = pg_catalog, public, pg_temp/);
assert.match(sql,/public\.current_user_authorization\(\)/);
assert.match(sql,/auth_role NOT IN \('super_admin','admin','manager'\)/);
assert.match(sql,/p_expected_version/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/prior\.version <> p_expected_version/);
assert.match(sql,/INSERT INTO public\.audit_logs/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.save_staff_roster_time_policy_draft/);
assert.match(sql,/TO authenticated/);
assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.staff_roster_guard\(/,
  "Do not change the live UTC/rest roster guard before policy activation E2E");
const e2e=fs.readFileSync("scripts/hr-roster-time-policy-drafts-e2e.sql","utf8");
for(const must of [
  "ROLLBACK;","Cashier can create HR time policy","Cross-tenant branch accepted",
  "Another tenant sees the first tenant policy","Stale second-tab draft overwrite",
  "Policy approved before UTC/rest trigger cutover","Out-of-order draft revision",
  "Draft create/update audit trail count mismatch",
]) assert.ok(e2e.includes(must),"Missing PostgreSQL negative-case proof: "+must);
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
assert.match(ci,/Verify HR-004C manager policy drafts and RLS in PostgreSQL 17/);
assert.match(ci,/scripts\/hr-roster-time-policy-drafts-e2e\.sql/);
assert.match(ci,/supabase\/migrations\/20261010_hr_roster_time_policy_drafts\.sql/);
console.log("HR-004C tenant-safe draft policy, non-activation and PostgreSQL real-E2E contract PASS");
