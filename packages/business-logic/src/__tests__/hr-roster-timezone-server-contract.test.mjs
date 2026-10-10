import assert from "node:assert/strict";
import fs from "node:fs";

const migration = "20261010_hr_roster_iana_time_resolution.sql";
const sql=fs.readFileSync("supabase/migrations/"+migration,"utf8");
const order=fs.readFileSync("supabase/MIGRATION_ORDER.txt","utf8")
  .split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith("#"));
assert.equal(order.filter(x=>x===migration).length,1,
  "New timezone resolver migration must appear exactly once in portable replay order");
assert.ok(order.indexOf(migration)>order.indexOf("20261009_hr_roster_event_authority.sql"),
  "IANA resolver must follow tenant roster schema and audited event authority");
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.roster_resolve_local_instant\(/);
assert.match(sql,/RETURNS TIMESTAMPTZ/);
assert.match(sql,/LANGUAGE plpgsql STABLE SECURITY INVOKER/);
assert.match(sql,/SET search_path = pg_catalog, pg_temp/);
assert.match(sql,/FROM pg_catalog\.pg_timezone_names WHERE name=p_iana_zone/);
assert.match(sql,/p_fold_policy NOT IN \('reject','earlier','later'\)/);
assert.match(sql,/v_candidate AT TIME ZONE p_iana_zone/);
assert.match(sql,/pg_catalog\.cardinality\(v_matches\)=0/);
assert.match(sql,/v_earlier IS DISTINCT FROM v_later AND p_fold_policy='reject'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.roster_resolve_local_instant\(/);
assert.match(sql,/FROM PUBLIC, anon, authenticated/);
assert.doesNotMatch(sql,/SECURITY DEFINER|GRANT EXECUTE .*authenticated/i);
assert.doesNotMatch(sql,/CREATE TRIGGER|ALTER TABLE|DELETE FROM public|UPDATE public/i,
  "Untested policy rollout cannot silently replace production roster authority");
const e2e=fs.readFileSync("scripts/hr-roster-timezone-resolver-e2e.sql","utf8");
for(const name of ["Asia/Kolkata","America/New_York","Australia/Lord_Howe","Europe/London",
                    "Spring-forward gap","fold","insufficient_privilege"]){
  assert.ok(e2e.includes(name),"Missing real database conformance check: "+name);
}
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
assert.match(ci,/Verify HR-004C IANA\/DST instants in real PostgreSQL 17/);
assert.match(ci,/scripts\/hr-roster-timezone-resolver-e2e\.sql/);
assert.match(ci,/supabase\/migrations\/20261010_hr_roster_iana_time_resolution\.sql/);
console.log("HR-004C timezone resolver migration order, security restrictions and PostgreSQL E2E registration PASS");
