import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync("supabase/migrations/20261009_hr_roster_schema_authority.sql","utf8");
const order=fs.readFileSync("supabase/MIGRATION_ORDER.txt","utf8").trim().split(/\r?\n/).filter(Boolean);
const schemaIndex=order.indexOf("20261009_hr_roster_schema_authority.sql");
const attendanceIndex=order.indexOf("20261009_attendance_foreign_key_indexes.sql");
const eventsIndex=order.indexOf("20261009_hr_roster_event_authority.sql");
assert.ok(schemaIndex>attendanceIndex,"Apply roster schema after attendance and its foreign-key indexes");
assert.ok(eventsIndex===-1||eventsIndex>schemaIndex,"Roster event RPC must follow its schema");
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.staff_shift_rules/);
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.staff_roster_slots/);
assert.match(sql,/CONSTRAINT roster_shift_break_valid CHECK/);
assert.match(sql,/CONSTRAINT staff_roster_unique_shift_day UNIQUE\(org_id,staff_id,work_date,shift_rule_id\)/);
for(const table of ["staff_shift_rules","staff_roster_slots"]){
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql,new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
}
assert.match(sql,/REVOKE ALL ON public\.staff_shift_rules, public\.staff_roster_slots FROM PUBLIC, anon, authenticated/);
assert.match(sql,/GRANT SELECT ON public\.staff_shift_rules, public\.staff_roster_slots TO authenticated/);
assert.doesNotMatch(sql,/GRANT (ALL|INSERT|UPDATE|DELETE) ON public\.staff_(?:shift_rules|roster_slots) TO authenticated/i);
assert.match(sql,/public\.user_has_org_role\(org_id,ARRAY\['super_admin','admin','manager'\]::text\[\]\)/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.staff_roster_guard\(\)/);
assert.match(sql,/NEW\.version <> OLD\.version \+ 1/);
assert.match(sql,/NEW\.org_id IS DISTINCT FROM OLD\.org_id/);
assert.match(sql,/NEW\.staff_id IS DISTINCT FROM OLD\.staff_id/);
assert.match(sql,/NEW\.branch_id IS DISTINCT FROM OLD\.branch_id/);
assert.match(sql,/template\.branch_id IS NOT NULL AND NEW\.branch_id IS DISTINCT FROM template\.branch_id/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(NEW\.org_id::text\|\|NEW\.staff_id::text,0\)\)/);
assert.match(sql,/other\.work_date BETWEEN NEW\.work_date-1 AND NEW\.work_date\+1/);
assert.match(sql,/Roster shift overlaps existing assignment/);
assert.match(sql,/CREATE TRIGGER staff_shift_rules_guard/);
assert.match(sql,/CREATE TRIGGER staff_roster_slots_guard/);
assert.doesNotMatch(sql,/\b(?:TRUNCATE|DELETE FROM|DROP TABLE|ALTER TABLE public\.(?:staff_attendance|staff_members)\s+DROP)\b/i);
console.log("HR roster schema tenant security and overnight overlap source contract PASS");
