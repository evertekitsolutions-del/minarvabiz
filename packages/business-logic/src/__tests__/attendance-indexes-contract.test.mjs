import assert from "node:assert/strict";
import fs from "node:fs";

// The index migration is additive. Run the actual migration against fresh and
// production PostgreSQL as a separate CI/deployment gate; this source contract
// protects the shape of the narrowly scoped production hardening change.
const sql = fs.readFileSync(new URL("../../../../supabase/migrations/20261009_attendance_foreign_key_indexes.sql", import.meta.url), "utf8");
const withoutComments = sql.replace(/^--.*$/gm, "").trim();
const statements = withoutComments.split(";").map(s => s.trim()).filter(Boolean);
assert.equal(statements.length, 2, "Only two expected attendance FK indexes should be introduced");
assert.match(statements[0], /^CREATE INDEX IF NOT EXISTS idx_staff_attendance_branch_fk\s+ON public\.staff_attendance\s*\(branch_id\)$/i);
assert.match(statements[1], /^CREATE INDEX IF NOT EXISTS idx_staff_attendance_receipts_org_fk\s+ON public\.staff_attendance_event_receipts\s*\(org_id\)$/i);
for (const statement of statements) {
  assert.doesNotMatch(statement, /\b(DROP|DELETE|UPDATE|TRUNCATE|ALTER|GRANT|REVOKE)\b/i, "Index migration must not change records, policies or grants");
}
console.log("Attendance foreign-key indexes contract PASS");
