import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261110_saas_storefront_fulfillment.sql","utf8");
const ui=readFileSync("apps/web/src/app/(app)/storefront/saas-order-fulfillment-panel.tsx","utf8");
const merchant=readFileSync("apps/web/src/app/(app)/storefront/page.tsx","utf8");
test("M17 durable order status machine atomically consumes reservation into unpaid sale",()=>{
 for(const re of [
 /CREATE TABLE IF NOT EXISTS public\.saas_storefront_fulfillment_events/,
 /ENABLE ROW LEVEL SECURITY/,
 /saas_storefront_one_confirmed_invoice/,
 /saas_online_order_transition\(/,
 /pg_advisory_xact_lock/,
 /WHERE id=p_order_id AND org_id=v_org FOR UPDATE/,
 /pending_review' AND p_target_status IN\('confirmed','cancelled','expired'\)/,
 /v_prev='confirmed' AND p_target_status='packed'/,
 /v_prev='packed' AND p_target_status='shipped'/,
 /v_prev='shipped' AND p_target_status='delivered'/,
 /v_expected<>v_actual/,
 /v_other_held/,
 /v_branch_qty/,
 /FOR UPDATE/,
 /UPDATE public\.saas_storefront_stock_reservations SET released_at=/,
 /public\.create_sale\(/,
 /'paid_amount',0/,
 /'balance_amount',v_order\.total/,
 /'payment_state','unpaid'/,
 /REVOKE EXECUTE ON FUNCTION public\.saas_storefront_place_order/,
 ])assert.match(sql,re);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.payments\b/);
 assert.doesNotMatch(sql,/\bUPDATE public\.saas_supplier_payables\b/);
});
test("M17 merchant web controls use persisted event + confirmed unpaid invoice readback",()=>{
 for(const re of [
 /saas_online_order_transition/,/saas_storefront_fulfillment_events/,
 /target==="confirmed"/,/pgSelect<\{id:string;paid_amount:number;balance_amount:number\}>/,
 /can\("sales.create"\)/,/getOutboxScope/,
 /confirmed:\["packed"\]/,/packed:\["shipped"\]/,/shipped:\["delivered"\]/,
 /pending\.current\[k\]\?\?=/,/Session changed/
 ])assert.match(ui,re);
 assert.match(merchant,/SaasOrderFulfillmentPanel/);
});
