import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("guest draft throttling serializes concurrent same-phone submissions and leaves idempotent replays intact",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_store_guest_order_throttle.sql","utf8");
 const original=readFileSync("supabase/migrations/20261110_saas_tenant_public_storefront.sql","utf8");
 assert.match(sql,/BEFORE INSERT ON public\.saas_storefront_draft_orders/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/v_recent >= 3/);
 assert.match(sql,/created_at > pg_catalog\.now\(\) - interval '1 hour'/);
 assert.match(sql,/storefront_id=NEW\.storefront_id/);
 assert.match(sql,/buyer_phone=NEW\.buyer_phone/);
 assert.match(original,/IF FOUND THEN[\s\S]*?'idempotent',true/);
 assert.doesNotMatch(sql,/\b(DELETE|TRUNCATE|DROP TABLE|UPDATE public\.products|capture_payment)\b/i);
});
