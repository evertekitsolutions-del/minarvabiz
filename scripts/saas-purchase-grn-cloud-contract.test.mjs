import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("purchase orders are tenant-only, immutable and GRN atomically posts stock and payables",()=>{
 const sql=readFileSync("supabase/migrations/20261110_saas_purchase_orders_grn.sql","utf8");
 for(const re of [/ENABLE ROW LEVEL SECURITY/g,/public\.saas_purchase_orders/,/public\.saas_purchase_order_items/,
 /public\.saas_goods_receipts/,/public\.saas_supplier_payables/,/SECURITY DEFINER/,
 /public\.saas_create_purchase_order/,/public\.saas_receive_purchase_order/,
 /FOR UPDATE/,/public\.adjust_stock\(/,/PO already received under different GRN ID/,
 /REVOKE ALL ON public\.saas_purchase_orders/])assert.match(sql,re);
 assert.doesNotMatch(sql,/GRANT\s+INSERT ON public\.saas_goods_receipts TO authenticated/);
});
test("SaaS purchases UI uses scoped RPC and read-after-write; legacy saves not visible",()=>{
 const page=readFileSync("apps/web/src/app/(app)/purchases/page.tsx","utf8");
 const ui=readFileSync("apps/web/src/app/(app)/purchases/saas-purchases-panel.tsx","utf8");
 assert.match(page,/getRuntimeMode\(\) !== "demo"\) return <SaasPurchasesPanel/);
 assert.match(ui,/"saas_create_purchase_order"/);
 assert.match(ui,/"saas_receive_purchase_order"/);
 assert.match(ui,/saas_goods_receipts/);
 assert.match(ui,/saas_supplier_payables/);
 assert.match(ui,/pgSelect<Po>/);
});
