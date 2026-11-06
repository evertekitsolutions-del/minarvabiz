import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const name = "20261106_int002_webhook_delivery_outbox.sql";
const sql = fs.readFileSync(root + "supabase/migrations/" + name, "utf8");
const order = fs.readFileSync(root + "supabase/MIGRATION_ORDER.txt", "utf8");

test("delivery outbox migration is registered exactly once after subscription storage", () => {
  const migrations = order.split(/\r?\n/).map(line => line.trim());
  assert.equal(migrations.filter(line => line === name).length, 1);
  assert.ok(migrations.indexOf(name) > migrations.indexOf("20261106_int002_webhook_subscriptions.sql"));
});
test("webhook outbox has durable scoped idempotency and FK authority", () => {
  for (const clause of [
    "primary key (tenant_id, company_id, branch_key, delivery_id)",
    "unique (tenant_id, company_id, branch_key, subscription_id, event_id)",
    "foreign key (tenant_id, company_id, branch_key, subscription_id)",
    "on delete restrict",
    "status text not null default 'pending'",
    "attempt_count integer not null default 0",
    "next_attempt_at timestamptz not null default now()",
    "where status = 'pending'",
  ]) assert.ok(sql.includes(clause), clause);
});
test("delivery outbox remains private, feature-off and has no outbound dispatch", () => {
  for (const clause of [
    "enable row level security",
    "force row level security",
    "revoke all on public.integration_webhook_delivery_outbox from public, anon, authenticated",
    "grant select, insert, update on public.integration_webhook_delivery_outbox to service_role",
  ]) assert.ok(sql.includes(clause), clause);
  assert.ok(!/http_post|net\.http|pg_net|create trigger/i.test(sql));
});
