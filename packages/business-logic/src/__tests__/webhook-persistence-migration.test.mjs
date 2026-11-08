import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const sql = fs.readFileSync(root + "supabase/migrations/20261106_int002_webhook_subscriptions.sql", "utf8");
const order = fs.readFileSync(root + "supabase/MIGRATION_ORDER.txt", "utf8");
test("INT-002 migration is registered exactly once for fresh-instance replay", () => {
  assert.equal(order.split(/\r?\n/).filter(line => line.trim() === "20261106_int002_webhook_subscriptions.sql").length, 1);
});
test("INT-002 subscription table is scoped, disabled by default and denies direct client access", () => {
  for (const part of [
    "primary key (tenant_id, company_id, branch_key, subscription_id)",
    "enabled boolean not null default false",
    "enable row level security",
    "force row level security",
    "revoke all on public.integration_webhook_subscriptions from public, anon, authenticated",
    "grant select, insert, update, delete on public.integration_webhook_subscriptions to service_role",
  ]) assert.ok(sql.includes(part), part);
});
