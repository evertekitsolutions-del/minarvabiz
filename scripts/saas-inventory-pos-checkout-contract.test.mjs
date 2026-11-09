import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("M7 inventory requests use durable tenant receipts and advisory idempotency",()=>{
 const sql=readFileSync("supabase/migrations/20261109_saas_inventory_pos_checkout_receipts.sql","utf8");
 for(const re of [
  /CREATE TABLE IF NOT EXISTS public\.saas_inventory_mutation_receipts/,
  /ENABLE ROW LEVEL SECURITY/,
  /SECURITY INVOKER/,
  /public\.saas_adjust_stock_once/,
  /pg_advisory_xact_lock/,
  /Idempotency key reused with different inventory payload/,
  /public\.adjust_stock\(/,
  /FOR SELECT TO authenticated/,
 ])assert.match(sql,re);
 const adapter=readFileSync("apps/web/src/lib/online-product-save.ts","utf8");
 assert.match(adapter,/"saas_adjust_stock_once"/);
 assert.match(adapter,/p_mutation_id: referenceId/);
 assert.match(adapter,/reference_type=eq\.saas_inventory/);
 assert.match(adapter,/move(?:ment)?\.product_id|movement\.product_id/);
});

test("M9 validates tax-inclusive Price and M10 restricts negative stock checkout",()=>{
 const sql=readFileSync("supabase/migrations/20261109_saas_inventory_pos_checkout_receipts.sql","utf8");
 assert.match(sql,/public\.saas_gst_inclusive_price/);
 assert.match(sql,/v_net:=round\(v_gross\*100\/\(100\+v_tax\),2\)/);
 assert.match(sql,/public\.saas_checkout_once/);
 assert.match(sql,/public\.create_sale\(p_sale,p_payments,false\)/);
 assert.match(sql,/Checkout ID reused with different sale\/payment payload/);
 assert.match(sql,/saas_checkout_receipts/);
});

test("online POS never reports local-only sale success",()=>{
 const page=readFileSync("apps/web/src/app/(app)/sales/page.tsx","utf8");
 const form=readFileSync("apps/web/src/app/(app)/sales/saas-cloud-pos.tsx","utf8");
 assert.match(page,/getRuntimeMode\(\) !== "demo" && tab !== "history" && <SaasCloudPos/);
 assert.match(page,/if \(getRuntimeMode\(\) !== "demo"\) return \{ success: false/);
 assert.match(form,/"saas_checkout_once"/);
 assert.match(form,/"saas_gst_inclusive_price"/);
 assert.match(form,/const \[sales,items,movements\]=await Promise\.all/);
 assert.match(form,/p_payments:\[\]/);
 assert.doesNotMatch(form,/store\.createSale/);
});

test("server-only receipt writers cannot be spoofed by browser Auth role",()=>{
 const guard=readFileSync("supabase/migrations/20261109_saas_receipts_private_write_guard.sql","utf8");
 assert.match(guard,/REVOKE INSERT ON public\.saas_checkout_receipts FROM authenticated/);
 assert.match(guard,/REVOKE INSERT ON public\.saas_inventory_mutation_receipts FROM authenticated/);
 assert.match(guard,/ALTER FUNCTION public\.saas_checkout_once\(uuid,jsonb,jsonb\)/);
 assert.match(guard,/ALTER FUNCTION public\.saas_adjust_stock_once/);
});
test("server-authoritative POS rejects forged prices and payment capture",()=>{
 const guard=readFileSync("supabase/migrations/20261109_saas_checkout_price_authority_guard.sql","utf8");
 assert.match(guard,/Client POS amount differs from authoritative catalog/);
 assert.match(guard,/Only validated unpaid, undiscounted cloud POS receipts are allowed/);
 assert.match(guard,/p_payments IS DISTINCT FROM '\[\]'::jsonb/);
 assert.match(guard,/v_line:=round\(v_product\.selling_price\*v_quantity,2\)/);
 assert.match(guard,/v_result:=public\.create_sale\(p_sale,'\[\]'::jsonb,false\)/);
});
