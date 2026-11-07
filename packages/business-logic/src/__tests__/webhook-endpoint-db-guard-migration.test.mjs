import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../../../supabase/migrations/20261108_int002_webhook_endpoint_db_guard.sql", import.meta.url), "utf8");
const order = readFileSync(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url), "utf8");

test("service-role webhook writes require HTTPS and reject credentials, fragments and whitespace", () => {
  assert.match(sql, /alter table public\.integration_webhook_subscriptions/);
  assert.match(sql, /add constraint integration_webhook_subscriptions_https_endpoint/);
  assert.match(sql, /endpoint ~ '\^https:\/\//);
  assert.match(sql, /endpoint !~ '\[@#\[:space:\]\]'/);
  assert.match(sql, /not valid;/i);
});

test("endpoint guard follows webhook subscription creation in migration order", () => {
  const entries = order.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const base = entries.indexOf("20261106_int002_webhook_subscriptions.sql");
  const guard = entries.indexOf("20261108_int002_webhook_endpoint_db_guard.sql");
  assert.ok(base >= 0 && guard > base);
  assert.equal(entries.filter((entry) => entry === "20261108_int002_webhook_endpoint_db_guard.sql").length, 1);
});
