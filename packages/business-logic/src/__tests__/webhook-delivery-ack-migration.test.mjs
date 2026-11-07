import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const sql = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261107_int002_webhook_delivery_ack.sql", import.meta.url)), "utf8");
const order = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url)), "utf8");

test("ack is service-role only and uses exact scope plus lease fencing", () => {
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function public\.complete_integration_webhook_delivery\(text,text,text,uuid,timestamptz,boolean\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.complete_integration_webhook_delivery\(text,text,text,uuid,timestamptz,boolean\)\s+to service_role/i);
  for (const field of ["tenant_id", "company_id", "branch_key", "delivery_id", "lease_until"]) {
    assert.match(sql, new RegExp("o\\." + field + " = p_" + field));
  }
  assert.match(sql, /o\.status = 'leased' and o\.lease_until = p_lease_until/i);
  assert.match(sql, /o\.lease_until > now\(\)/i);
});
test("success is terminal; failures retry with capped backoff or dead-letter", () => {
  assert.match(sql, /when p_succeeded then 'delivered'/i);
  assert.match(sql, /o\.attempt_count >= 20 then 'dead'/i);
  assert.match(sql, /else 'pending'/i);
  assert.match(sql, /least\(3600, \(power\(2::numeric, least\(o\.attempt_count, 10\)\) \* 5\)::integer\)/i);
  assert.match(sql, /get diagnostics v_updated = row_count/i);
  assert.doesNotMatch(sql, /response_body|secret_value|authorization_header/i);
});
test("fresh replay registers acknowledgement after lease claim exactly once", () => {
  const lines = order.split(/\r?\n/);
  const name = "20261107_int002_webhook_delivery_ack.sql";
  assert.equal(lines.filter((line) => line === name).length, 1);
  assert.ok(lines.indexOf(name) > lines.indexOf("20261107_int002_webhook_claim_leases.sql"));
});

test("revoked subscription or removed event cannot be acknowledged as delivered", () => {
  assert.match(sql, /not p_succeeded or exists\s*\(/i);
  assert.match(sql, /s\.tenant_id = o\.tenant_id and s\.company_id = o\.company_id/i);
  assert.match(sql, /s\.branch_key = o\.branch_key and s\.subscription_id = o\.subscription_id/i);
  assert.match(sql, /s\.enabled = true and o\.event_type = any\(s\.events\)/i);
});

test("failed acknowledgement after consent revocation is terminal, never requeued", () => {
  assert.match(sql, /when not exists\s*\(\s*select 1 from public\.integration_webhook_subscriptions s/i);
  assert.match(sql, /\) then 'dead'\s*when o\.attempt_count >= 20 then 'dead'/i);
  assert.match(sql, /s\.enabled = true and o\.event_type = any\(s\.events\)/i);
});
