import assert from "node:assert/strict";
import fs from "node:fs";

const migration="20261011_hr_roster_policy_review_history.sql";
const sql=fs.readFileSync("supabase/migrations/"+migration,"utf8");
const order=fs.readFileSync("supabase/MIGRATION_ORDER.txt","utf8")
  .split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith("#"));
assert.equal(order.filter(x=>x===migration).length,1);
assert.ok(order.indexOf(migration)>order.indexOf("20261011_hr_roster_utc_rest_primitives.sql"),
  "Review authority cannot precede internal UTC/rest validation foundation");
assert.match(sql,/CREATE TABLE public\.staff_roster_policy_reviews/);
assert.match(sql,/CONSTRAINT staff_roster_review_version_unique UNIQUE\(policy_id,policy_version\)/);
assert.match(sql,/activation_state TEXT NOT NULL DEFAULT 'inactive' CHECK \(activation_state='inactive'\)/);
assert.match(sql,/ALTER TABLE public\.staff_roster_policy_reviews ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/ALTER TABLE public\.staff_roster_policy_reviews FORCE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON public\.staff_roster_policy_reviews FROM PUBLIC,anon,authenticated/);
assert.match(sql,/GRANT SELECT ON public\.staff_roster_policy_reviews TO authenticated/);
assert.match(sql,/CREATE TRIGGER staff_roster_policy_review_no_mutation/);
assert.match(sql,/CREATE FUNCTION public\.review_staff_roster_time_policy/);
assert.match(sql,/auth_role NOT IN \('super_admin','admin'\)/);
assert.match(sql,/current_user_authorization\(\)/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/FOR UPDATE/);
assert.match(sql,/previous_review\.policy_version>=p_expected_version/);
assert.match(sql,/effective_from<=COALESCE\(draft\.effective_until/);
assert.match(sql,/INSERT INTO public\.audit_logs/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.review_staff_roster_time_policy/);
assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.staff_roster_guard|GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public\.staff_roster_policy_reviews TO authenticated/i,
  "Reviewed-but-inactive policies must not modify the production roster guard");
const e2e=fs.readFileSync("scripts/hr-roster-policy-reviews-e2e.sql","utf8");
for(const must of [
  "ROLLBACK;","Manager wrongfully approved","Cashier can read",
  "Cross-tenant policy review history visible","Colliding branch policy approved",
  "Same revision was reviewed twice","Stale client review",
  "Privileged review history update bypassed","Privileged deletion erased"
]) assert.ok(e2e.includes(must),"Missing security test: "+must);
const ci=fs.readFileSync(".github/workflows/ci.yml","utf8");
assert.match(ci,/Verify HR-004C inactive policy review authority in PostgreSQL 17/);
assert.match(ci,/scripts\/hr-roster-policy-reviews-e2e\.sql/);
console.log("HR004C policy approval-review authority, immutable history and PG17 registration PASS");
