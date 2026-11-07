import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const name = "20261107_int002_webhook_atomic_enqueue.sql";
const sql = fs.readFileSync(root + "supabase/migrations/" + name, "utf8");
const order = fs.readFileSync(root + "supabase/MIGRATION_ORDER.txt", "utf8")
  .split(/\r?\n/).map(line => line.trim());

test("atomic enqueue migration follows both subscription and outbox storage", () => {
  assert.equal(order.filter(line => line === name).length, 1);
  assert.ok(order.indexOf(name) > order.indexOf("20261106_int002_webhook_delivery_outbox.sql"));
});

test("enqueue is service-role-only, invoker-scoped, and never sends network requests", () => {
  for (const clause of [
    "security invoker", "set search_path = ''", "from public.integration_webhook_subscriptions s",
    "s.tenant_id = p_tenant_id", "s.company_id = p_company_id",
    "s.branch_key = p_branch_key", "s.subscription_id = p_subscription_id",
    "s.enabled = true", "p_event_type = any(s.events)",
    "on conflict (tenant_id, company_id, branch_key, subscription_id, event_id)",
    "do nothing", "revoke all on function", "from public, anon, authenticated",
    "to service_role",
  ]) assert.ok(sql.includes(clause), clause);
  assert.ok(!/net\.http|http_post|dblink|pg_net/i.test(sql));
});

test("invalid payload and duplicate replay fail closed", () => {
  for (const clause of [
    "p_delivery_id is null", "p_event_id is null",
    "length(p_event_id) not between 1 and 160",
    "jsonb_typeof(p_payload) <> 'object'",
    "pg_column_size(p_payload) > 65536",
    "raise exception 'Invalid webhook delivery request'",
    "return v_inserted = 1",
  ]) assert.ok(sql.includes(clause), clause);
});
