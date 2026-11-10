import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 VERTICALS,OPTIONAL_MODULES,isVertical,isPrimary,parseTenantIndustryProfile,
 selectedIndustries,industryProductFields,industryPosHints,
 visibleIndustryNavIds,visibleIndustryActions,
} from "../apps/web/src/lib/tenant-industry.ts";

const fixture=(primary,verticals)=>({
 org_id:"00000000-0000-4000-8000-000000000001",primary_vertical:primary,
 enabled_verticals:verticals,enabled_modules:[],
 country_code:"OM",currency_code:"OMR",language_code:"ar",
 updated_at:"2026-11-10T08:00:00Z",
});
test("P0 industry registry has seven separate verticals without boutique default",()=>{
 assert.equal(VERTICALS.length,7);
 assert.equal(new Set(VERTICALS.map(v=>v.id)).size,7);
 for(const id of [
  "fmcg_supermarket","pharmacy_medical","electronics_computer",
  "bakery_cafe_restaurant","boutique_apparel","laundry_tailoring",
  "general_trading_b2b"
 ])assert.equal(isVertical(id),true);
 assert.equal(isPrimary("multi_vertical"),true);
 assert.equal(isPrimary("boutique"),false);
 assert.equal(OPTIONAL_MODULES.length,5);
});
test("P0 medical store: medical/expiry hints, NO laundry or tailoring sidebar",()=>{
 const p=parseTenantIndustryProfile(fixture("pharmacy_medical",["pharmacy_medical"]));
 assert.deepEqual(selectedIndustries(p).map(v=>v.id),["pharmacy_medical"]);
 assert.ok(industryProductFields(p).includes("Drug schedule"));
 assert.ok(industryProductFields(p).includes("Expiry date"));
 assert.equal(visibleIndustryNavIds(p).has("laundry"),true);
 assert.equal(visibleIndustryNavIds(p).has("services"),true);
 assert.equal(visibleIndustryActions(p).has("laundry"),false);
 assert.equal(visibleIndustryActions(p).has("sale"),true);
});
test("P0 electronics: service/serial and OMR context, no forced boutique",()=>{
 const p=parseTenantIndustryProfile(fixture("electronics_computer",["electronics_computer"]));
 assert.ok(industryProductFields(p).includes("Serial / IMEI"));
 assert.ok(industryProductFields(p).includes("Warranty period"));
 assert.equal(visibleIndustryNavIds(p).has("services"),false);
 assert.equal(visibleIndustryNavIds(p).has("laundry"),true);
 assert.equal(p.currency_code,"OMR");
 assert.equal(p.language_code,"ar");
});
test("P0 cafe vs supermarket: distinct product and POS presentation",()=>{
 const cafe=parseTenantIndustryProfile(fixture("bakery_cafe_restaurant",["bakery_cafe_restaurant"]));
 const fmcg=parseTenantIndustryProfile(fixture("fmcg_supermarket",["fmcg_supermarket"]));
 assert.ok(industryProductFields(cafe).includes("Table / KOT number"));
 assert.ok(industryProductFields(fmcg).includes("Bulk tier pricing"));
 assert.notDeepEqual(industryPosHints(cafe),industryPosHints(fmcg));
});
test("P0 boutique and laundry remain opt-in sectors, not global defaults",()=>{
 const boutique=parseTenantIndustryProfile(fixture("boutique_apparel",["boutique_apparel"]));
 const laundry=parseTenantIndustryProfile(fixture("laundry_tailoring",["laundry_tailoring"]));
 assert.ok(industryProductFields(boutique).includes("38x25 mm 2-up label"));
 assert.equal(visibleIndustryNavIds(boutique).has("laundry"),true);
 assert.equal(visibleIndustryNavIds(laundry).has("laundry"),false);
 assert.equal(visibleIndustryActions(laundry).has("laundry"),true);
 assert.equal(visibleIndustryActions(boutique).has("laundry"),false);
 assert.equal(visibleIndustryNavIds(null).has("laundry"),true);
});
test("P0 multiple industries aggregate hints without duplicate fields",()=>{
 const raw=fixture("multi_vertical",["fmcg_supermarket","electronics_computer","boutique_apparel"]);
 const p=parseTenantIndustryProfile(raw);
 assert.equal(industryProductFields(p).includes("Serial / IMEI"),true);
 assert.equal(industryProductFields(p).includes("Expiry date"),true);
 assert.equal(new Set(industryProductFields(p)).size,industryProductFields(p).length);
 assert.ok(Object.isFrozen(p));
});
test("P0 cannot load wrong tenant or malformed selectors",()=>{
 const bad=fixture("pharmacy_medical",["boutique_apparel"]);
 assert.throws(()=>parseTenantIndustryProfile(bad));
 assert.throws(()=>parseTenantIndustryProfile({...bad,primary_vertical:"medical"}));
 assert.throws(()=>parseTenantIndustryProfile({...bad,primary_vertical:"multi_vertical",enabled_modules:["paid_gateway"]}));
 assert.throws(()=>parseTenantIndustryProfile({...bad,primary_vertical:"multi_vertical",country_code:"OMAN"}));
 assert.throws(()=>parseTenantIndustryProfile({...bad,primary_vertical:"multi_vertical",currency_code:"XAU"}));
});
test("P0 SQL: trigger persists preference, not entitlement, and policies correlate orgs",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_tenant_dynamic_industry_profiles.sql","utf8");
 const register=readFileSync("apps/web/src/app/register/page.tsx","utf8");
 const settings=readFileSync("apps/web/src/app/(app)/settings/industry/page.tsx","utf8");
 const shell=readFileSync("apps/web/src/components/AppLayoutClient.tsx","utf8");
 const product=readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
 for(const term of [
  "create table if not exists public.saas_tenant_industry_profiles",
  "alter table public.saas_tenant_industry_profiles enable row level security",
  "user_has_org_role(org_id",
  "m.org_id = saas_tenant_industry_profiles.org_id",
  "create or replace function private.bootstrap_new_user()",
  "minarva_license_admin_bootstrap",
  "requested_verticals",
  "on conflict(org_id) do nothing"
 ])assert.ok(sql.includes(term),term);
 assert.ok(register.includes("requested_industry"));
 assert.ok(settings.includes('supabase.from("saas_tenant_industry_profiles")'));
 assert.ok(shell.includes("MAIN_NAV.filter(item=>!hiddenNav.has(item.id))"));
 assert.ok(product.includes('industryProfile?.enabled_verticals.includes("boutique_apparel")'));
 assert.doesNotMatch(sql,/grant.*(?:insert|delete).*saas_tenant_industry_profiles.*to authenticated/i);
});
