import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_marketing_campaign_coupons.sql","utf8");
const owner=readFileSync("apps/web/src/app/(app)/storefront/saas-marketing-campaign-panel.tsx","utf8");
const guest=readFileSync("apps/web/src/app/store/[slug]/saas-store-coupon-preview.tsx","utf8");
test("M18 tenant coupons, opt-in lead templates and immutable trigger audit",()=>{
 for(const re of [
 /CREATE TABLE IF NOT EXISTS public\.saas_marketing_coupons/,
 /CREATE TABLE IF NOT EXISTS public\.saas_marketing_campaign_templates/,
 /CREATE TABLE IF NOT EXISTS public\.saas_marketing_campaign_trigger_log/,
 /ENABLE ROW LEVEL SECURITY/g,
 /delivery_state text NOT NULL DEFAULT 'queued_no_transport'/,
 /saas_create_store_coupon_once/,
 /saas_preview_store_coupon/,
 /saas_create_campaign_template_once/,
 /saas_queue_lead_campaign_once/,
 /v_lead\.storefront_id/,/consent_at IS NOT NULL/,
 /UNIQUE\(lead_id,template_id\)/,
 /pg_advisory_xact_lock/,
 /v_prior\.code<>v_code/,/starts_at<=pg_catalog\.now\(\)/,
 /'preview_only',true/,
 /GRANT EXECUTE ON FUNCTION public\.saas_preview_store_coupon/,
 ])assert.match(sql,re);
 assert.doesNotMatch(sql,/request\('https|fetch\('https|send_message\(/);
});
test("M18 tenant UI previews coupons but never suggests checkout discounts were applied",()=>{
 for(const re of [
 /saas_create_store_coupon_once/,/saas_create_campaign_template_once/,
 /saas_queue_lead_campaign_once/,/getOutboxScope/,
 /can\("products.manage"\)/,/saas_marketing_campaign_trigger_log/,
 /queued_no_transport/,/pending\.current\[k\]\?\?=/,
 ])assert.match(owner,re);
 for(const re of [/saas_preview_store_coupon/,/preview_only!==true/,
 /NOT deducted/,/Check promo eligibility/])assert.match(guest,re);
});
