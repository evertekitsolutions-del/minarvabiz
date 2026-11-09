import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync("supabase/migrations/20261110_saas_storefront_close_unreserved_guest_checkout.sql","utf8");
const reservation=readFileSync("supabase/migrations/20261110_saas_storefront_atomic_stock_reservations.sql","utf8");
const buyer=readFileSync("apps/web/src/app/store/[slug]/page.tsx","utf8");
const order=readFileSync("supabase/MIGRATION_ORDER.txt","utf8");

test("M17 closes all public legacy checkout signatures after reservation migration",()=>{
 assert.match(migration,/p\.proname='saas_storefront_place_order'/);
 assert.match(migration,/REVOKE EXECUTE ON FUNCTION/);
 assert.match(migration,/FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/RAISE EXCEPTION 'Legacy storefront RPC missing/);
 assert.ok(order.indexOf("20261110_saas_storefront_atomic_stock_reservations.sql") <
           order.indexOf("20261110_saas_storefront_close_unreserved_guest_checkout.sql"));
});
test("reserved checkout remains the only buyer-facing RPC",()=>{
 assert.match(reservation,/v_base:=public\.saas_storefront_place_order\(/);
 assert.match(reservation,/GRANT EXECUTE ON FUNCTION public\.saas_storefront_checkout_reserved/);
 assert.match(buyer,/"saas_storefront_checkout_reserved"/);
 assert.doesNotMatch(buyer,/"saas_storefront_place_order"/);
 assert.doesNotMatch(migration,/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\./i);
});
