import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const sql = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261107_int002_webhook_revocation_fence.sql", import.meta.url)), "utf8");
const order = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url)), "utf8");

test("revocation fence is installed after outbox and acknowledgement", () => {
  const lines = order.trim().split(/\r?\n/);
  const name = "20261107_int002_webhook_revocation_fence.sql";
  assert.equal(lines.filter((line) => line === name).length, 1);
  assert.ok(lines.indexOf(name) > lines.indexOf("20261107_int002_webhook_delivery_ack.sql"));
  assert.match(sql, /after update of enabled, events or delete on public\.integration_webhook_subscriptions/i);
});
test("delete and disable fence only matching scoped undelivered deliveries", () => {
  for (const field of ["tenant_id", "company_id", "branch_key", "subscription_id"]) {
    assert.match(sql, new RegExp("o\\." + field + " = old\\." + field));
  }
  assert.match(sql, /tg_op = 'DELETE'/);
  assert.match(sql, /not new\.enabled/);
  assert.match(sql, /not \(o\.event_type = any\(new\.events\)\)/);
  assert.match(sql, /o\.status in \('pending', 'leased'\)/);
  assert.match(sql, /lease_until = null/);
  assert.doesNotMatch(sql, /status\s*=\s*'delivered'/);
});
test("trigger is idempotently replaced and never exposed to public clients", () => {
  assert.match(sql, /drop trigger if exists integration_webhook_revocation_fence/i);
  assert.match(sql, /security invoker set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.fence_integration_webhook_revocation\(\) from public, anon, authenticated/i);
});
