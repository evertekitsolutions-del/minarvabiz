import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("tenant ledger and GST derive from durable online records",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_unified_party_ledger.sql","utf8");
 for(const re of [/SECURITY INVOKER/g,/current_user_authorization/,
  /public\.sales/,/public\.laundry_orders/,/public\.payments/,
  /public\.purchases/,/public\.saas_gst_sales_summary/,/public\.saas_party_ledger/,
  /user_has_org_role/,/p_branch_id/,/NULL/])assert.match(sql,re);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
test("reports SaaS view blocks local-only report rendering and readbacks org",()=>{
 const page=readFileSync("apps/web/src/app/(app)/reports/page.tsx","utf8");
 const cloud=readFileSync("apps/web/src/app/(app)/reports/saas-ledger-panel.tsx","utf8");
 assert.match(page,/getRuntimeMode\(\) !== "demo"\) return <SaasLedgerPanel\s*\/>/);
 assert.match(cloud,/resolveOnlineAuthorization/);
 assert.match(cloud,/"saas_party_ledger"/);
 assert.match(cloud,/"saas_gst_sales_summary"/);
 assert.match(cloud,/a\.token!==getSessionToken\(\)/);
});
