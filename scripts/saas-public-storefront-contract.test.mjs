import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("storefront exposes published snapshots only and private tenant draft orders",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_tenant_public_storefront.sql","utf8");
 for(const re of [/ENABLE ROW LEVEL SECURITY/g,/public\.saas_storefronts/,/public\.saas_storefront_listings/,
  /public\.saas_storefront_draft_orders/,/CREATE POLICY saas_storefront_public_read/,
  /active AND EXISTS/,/CREATE POLICY saas_store_orders_tenant_read/,
  /REVOKE ALL ON public\.saas_storefronts/,/GRANT SELECT ON public\.saas_storefront_draft_orders TO authenticated/])
  assert.match(sql,re);
 assert.doesNotMatch(sql,/GRANT SELECT ON public\.saas_storefront_draft_orders TO anon/);
});
test("owner publish and guest checkout never capture payments or deduct stock",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_tenant_public_storefront.sql","utf8");
 for(const re of [/saas_publish_storefront/,/saas_storefront_place_order/,
  /SECURITY DEFINER/,/v_product\.stock_quantity<v_qty/,
  /v_product\.selling_price IS DISTINCT FROM v_listing\.price/,
  /pg_advisory_xact_lock/,/pending_review/,/v_existing\.request_body/])assert.match(sql,re);
 assert.doesNotMatch(sql,/public\.create_sale\(/);
 // Ignore SQL comments, then prohibit executable payment-provider/capture invocations.
 const executableSql=sql.replace(/^\s*--.*$/gm,"");
 assert.doesNotMatch(executableSql,/\b(?:capture_payment|charge_payment|stripe|razorpay)\b\s*\(/i);
});
test("buyer and owner interfaces only consume tenant-scoped Supabase catalog RPC",()=>{
 const buyer=readFileSync("apps/web/src/app/store/[slug]/page.tsx","utf8");
 const seller=readFileSync("apps/web/src/app/(app)/storefront/page.tsx","utf8");
 assert.match(buyer,/"saas_storefront_checkout_reserved"/);
 assert.match(buyer,/pending_review/);
 assert.match(seller,/"saas_publish_storefront"/);
 assert.match(seller,/resolveOnlineAuthorization/);
 assert.match(seller,/saas_storefront_draft_orders/);
});

// Include the additive server-side anonymous draft throttling contract.
import "./saas-store-guest-throttle.test.mjs";
