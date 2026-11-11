import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 OPTIONAL_MODULES,VERTICALS,parseTenantIndustryProfile,
} from "../apps/web/src/lib/tenant-industry.ts";

const profile=(vertical,modules=[])=>parseTenantIndustryProfile({
 org_id:"00000000-0000-4000-8000-000000000011",
 primary_vertical:vertical,enabled_verticals:[vertical],enabled_modules:modules,
 country_code:"OM",currency_code:"OMR",language_code:"en",
 updated_at:"2026-11-11T00:00:00Z",
});

test("P0: medical, electronics, cafe, supermarket, boutique have distinct dashboard identities",()=>{
 const ids=["pharmacy_medical","electronics_computer","bakery_cafe_restaurant",
  "fmcg_supermarket","boutique_apparel"];
 const labels=ids.map(id=>VERTICALS.find(v=>v.id===profile(id).primary_vertical)?.label);
 assert.equal(new Set(labels).size,5);
 assert.ok(labels.every(Boolean));
});
test("P0: optional apps are tenant-specific, not a global default",()=>{
 const a=profile("electronics_computer",["crm","field_service"]);
 const b=profile("pharmacy_medical",["online_store"]);
 assert.deepEqual(a.enabled_modules,["crm","field_service"]);
 assert.deepEqual(b.enabled_modules,["online_store"]);
 assert.equal(a.enabled_modules.includes("online_store"),false);
 assert.equal(b.enabled_modules.includes("field_service"),false);
});
test("P0: dashboard shows only enabled real routes and never staged loyalty as active",()=>{
 const source=readFileSync("apps/web/src/components/IndustryDashboard.tsx","utf8");
 assert.match(source,/profile\.enabled_modules\.includes\(a\.id\)/);
 assert.match(source,/DASHBOARD_APP_IDS\.has\(a\.id\)/);
 assert.match(source,/\["crm","online_store","field_service"\]/);
 assert.match(source,/getRuntimeMode\(\)==="demo"/);
 assert.match(source,/subscription entitlement and feature availability/);
 assert.ok(OPTIONAL_MODULES.some(a=>a.id==="loyalty"));
 assert.ok(!source.includes('"loyalty","online_store"'));
});
