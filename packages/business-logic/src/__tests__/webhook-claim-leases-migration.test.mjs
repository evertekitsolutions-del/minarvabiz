import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const sql = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261107_int002_webhook_claim_leases.sql", import.meta.url)), "utf8");
const order = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url)), "utf8");
test("claim lease is service-role-only and cannot expose anonymous execution", () => {
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function public\.claim_integration_webhook_deliveries\(integer,integer\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.claim_integration_webhook_deliveries\(integer,integer\) to service_role/i);
});
test("claim lease has concurrent worker safety and bounded retries", () => {
  assert.match(sql, /for update of o skip locked/i);
  assert.match(sql, /o\.attempt_count < 20/i);
  assert.match(sql, /o\.lease_until <= now\(\)/i);
  assert.match(sql, /s\.enabled = true/i);
  assert.match(sql, /o\.event_type = any\(s\.events\)/i);
  assert.match(sql, /p_limit not between 1 and 100/i);
  assert.match(sql, /p_lease_seconds not between 10 and 300/i);
});
test("fresh-instance migration replay orders lease after outbox and enqueue", () => {
  const lines = order.split(/\r?\n/);
  const name = "20261107_int002_webhook_claim_leases.sql";
  assert.equal(lines.filter((line) => line === name).length, 1);
  assert.ok(lines.indexOf(name) > lines.indexOf("20261107_int002_webhook_atomic_enqueue.sql"));
});

test("expired final-attempt leases transition to dead-letter instead of staying leased", () => {
  assert.match(sql, /update public\.integration_webhook_delivery_outbox o\s+set status = 'dead', lease_until = null/i);
  assert.match(sql, /where o\.status = 'leased' and o\.lease_until <= now\(\)\s+and o\.attempt_count >= 20/i);
  assert.ok(sql.indexOf("set status = 'dead'") < sql.indexOf("return query"));
});
