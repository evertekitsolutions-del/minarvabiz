import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const migration = "20261108_int002_webhook_subscription_audit.sql";
const sql = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/" + migration, import.meta.url)), "utf8");
const order = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url)), "utf8").trim().split(/\r?\n/);

test("subscription audit migration is registered after endpoint guard exactly once", () => {
  assert.equal(order.filter(line => line === migration).length, 1);
  assert.ok(order.indexOf(migration) > order.indexOf("20261108_int002_webhook_endpoint_db_guard.sql"));
});
test("subscription mutations record scope, revisions, state and operation without secrets", () => {
  for (const column of ["tenant_id", "company_id", "branch_key", "subscription_id", "old_revision", "new_revision", "old_enabled", "new_enabled", "changed_at"]) {
    assert.match(sql, new RegExp("\\b" + column + "\\b"));
  }
  assert.match(sql, /after insert or update or delete/i);
  assert.match(sql, /for each row execute function/i);
  assert.match(sql, /coalesce\(new\.tenant_id,old\.tenant_id\)/i);
  assert.doesNotMatch(sql, /\b(endpoint|secret|payload|signature)\s+text\b/i);
});
test("audit storage is not writable by application roles", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on public\.integration_webhook_subscription_audit from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.integration_webhook_subscription_audit to service_role/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on public\.integration_webhook_subscription_audit to service_role/i);
});
