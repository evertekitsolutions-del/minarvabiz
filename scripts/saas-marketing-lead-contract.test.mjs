import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_marketing_leads.sql","utf8");
const buyer=readFileSync("apps/web/src/app/store/[slug]/lead-capture.tsx","utf8");
const seller=readFileSync("apps/web/src/app/(app)/storefront/marketing-leads.tsx","utf8");
test("M18 tenant RLS, private PII, explicit consent, bounded public RPC",()=>{
 for(const re of [/ENABLE ROW LEVEL SECURITY/,/FOR SELECT TO authenticated/,
   /REVOKE ALL ON public\.saas_marketing_leads FROM PUBLIC,anon,authenticated/,
   /REVOKE ALL ON FUNCTION public\.saas_capture_storefront_lead/,
   /p_marketing_consent IS DISTINCT FROM true/,/published IS TRUE/,
   /Lead idempotency payload conflict/,/pg_advisory_xact_lock/,
   /v_hourly>=3/,/v_hourly>=50/,/RETURNING id INTO v_customer/,
   /GRANT EXECUTE ON FUNCTION public\.saas_capture_storefront_lead/])
   assert.match(sql,re);
 assert.doesNotMatch(sql,/GRANT SELECT ON public\.saas_marketing_leads TO anon/);
});
test("M18 published store lead UI uses stable retries and protects CRM read",()=>{
 assert.match(buyer,/"saas_capture_storefront_lead"/);
 assert.match(buyer,/crypto\.randomUUID\(\)/);
 assert.match(buyer,/p_marketing_consent:true/);
 assert.match(buyer,/pending\.current/);
 assert.match(seller,/"saas_marketing_leads"/);
 assert.match(seller,/resolveOnlineAuthorization/);
 assert.match(seller,/getOutboxScope/);
});
