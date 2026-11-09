import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("supabase/migrations/20261110_saas_storefront_atomic_stock_reservations.sql","utf8");
const buyer=readFileSync("apps/web/src/app/store/[slug]/page.tsx","utf8");

test("M17 online reservation: RLS private, bounded TTL, locking and oversell guard",()=>{
 for(const re of [
  /CREATE TABLE IF NOT EXISTS public\.saas_storefront_stock_reservations/,
  /ENABLE ROW LEVEL SECURITY/,
  /REVOKE ALL ON public\.saas_storefront_stock_reservations FROM PUBLIC,anon,authenticated/,
  /GRANT SELECT ON public\.saas_storefront_stock_reservations TO authenticated/,
  /v_expires:=pg_catalog\.now\(\)\+interval '15 minutes'/,
  /saas_storefront_place_order\(/,
  /pg_advisory_xact_lock/,
  /FOR UPDATE/,
  /ORDER BY value->>'product_id'/,
  /v_product\.stock_quantity-v_held<v_qty/,
  /v_active>=25/,
  /'reservation_status','held'/,
  /CREATE TRIGGER saas_guard_active_online_reservations_trg/,
  /NEW\.stock_quantity<v_held/,
  /GRANT EXECUTE ON FUNCTION public\.saas_storefront_checkout_reserved/,
 ])assert.match(source,re);
 assert.doesNotMatch(source,/GRANT SELECT ON public\.saas_storefront_stock_reservations TO anon/);
 assert.doesNotMatch(source,/\bUPDATE public\.products SET stock_quantity/);
 assert.doesNotMatch(source,/capture_payment|stripe\.charge|razorpay/i);
});
test("M17 storefront buyer requires server-held receipt before success",()=>{
 for(const re of [
  /"saas_storefront_checkout_reserved"/,
  /reservation_status!=="held"/,
  /reservation_expires_at/,
  /Pending staff confirmation; no money charged/,
  /pending\.current=null/,
 ])assert.match(buyer,re);
 assert.doesNotMatch(buyer,/"saas_storefront_place_order"/);
});
