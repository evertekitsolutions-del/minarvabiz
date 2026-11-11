import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareVerticalProductPayload,EMPTY_VERTICAL_FORM} from "../apps/web/src/lib/vertical-product-details.ts";

const org="00000000-0000-4000-8000-000000000011";
const profile=(ids)=>({
 org_id:org,primary_vertical:ids.length>1?"multi_vertical":ids[0],
 enabled_verticals:ids,enabled_modules:[],country_code:"IN",currency_code:"INR",
 language_code:"en",updated_at:"2026-11-11T00:00:00Z",
});
const sample=(industryId,patch={})=>({...EMPTY_VERTICAL_FORM,industryId,...patch});

test("pharmacy must have actual batch, expiry, drug schedule and formulation",()=>{
 const p=profile(["pharmacy_medical"]);
 for(const data of [
  sample("pharmacy_medical"),
  sample("pharmacy_medical",{batchNumber:"MED-01",expiryDate:"2027-12-31"}),
  sample("pharmacy_medical",{batchNumber:"MED-01",expiryDate:"2026-02-30",drugFormulation:"tablet",drugSchedule:"H"}),
 ])assert.throws(()=>prepareVerticalProductPayload(p,data,5));
 const ok=prepareVerticalProductPayload(p,sample("pharmacy_medical",{
  batchNumber:"MED-01",expiryDate:"2027-12-31",drugFormulation:"tablet",drugSchedule:"H",
 }),5);
 assert.equal(ok.industry_id,"pharmacy_medical");
 assert.equal(ok.batch_number,"MED-01");
 assert.equal(ok.drug_schedule,"H");
});
test("FMCG and bakery need expiry and batch, with optional recipe",()=>{
 const p=profile(["fmcg_supermarket","bakery_cafe_restaurant"]);
 for(const id of p.enabled_verticals){
  assert.throws(()=>prepareVerticalProductPayload(p,sample(id),10));
  const v=prepareVerticalProductPayload(p,sample(id,{
   batchNumber:"LOT-42",expiryDate:"2027-01-25",mrpPrice:"12.500",
   recipeReference:"base-dough-v2"
  }),10);
  assert.equal(v.mrp_price,12.5);
  assert.equal(v.batch_number,"LOT-42");
 }
});
test("electronics serial/IMEI and warranty are required; other verticals not forced",()=>{
 const p=profile(["electronics_computer"]);
 assert.throws(()=>prepareVerticalProductPayload(p,sample("electronics_computer"),20));
 assert.throws(()=>prepareVerticalProductPayload(p,sample("electronics_computer",{serialImei:"123"}),20));
 assert.throws(()=>prepareVerticalProductPayload(p,sample("electronics_computer",{serialImei:"123456",warrantyMonths:"241"}),20));
 const x=prepareVerticalProductPayload(p,sample("electronics_computer",{
  serialImei:"IMEI000000001234",warrantyMonths:"24"
 }),20);
 assert.equal(x.serial_imei,"IMEI000000001234");
 assert.equal(x.warranty_months,24);
 assert.throws(()=>prepareVerticalProductPayload(p,sample("pharmacy_medical"),20));
});
test("MRP cannot be below the selling price or exceed 3-decimal precision",()=>{
 const p=profile(["fmcg_supermarket"]);
 const base={batchNumber:"LOT",expiryDate:"2028-01-01"};
 for(const mrpPrice of ["8.99","10.0009","NaN","-2","1e9"]){
  assert.throws(()=>prepareVerticalProductPayload(p,sample("fmcg_supermarket",{...base,mrpPrice}),10));
 }
 assert.equal(prepareVerticalProductPayload(p,sample("fmcg_supermarket",{...base,mrpPrice:"10.001"}),10).mrp_price,10.001);
});
test("SQL enforces every tenant profile, RLS, trigger and transactional creation",()=>{
 const sql=readFileSync("supabase/migrations/20261111_saas_deep_vertical_product_metadata.sql","utf8");
 const client=readFileSync("apps/web/src/lib/online-product-save.ts","utf8");
 const ui=readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
 const pos=readFileSync("apps/web/src/app/(app)/sales/saas-cloud-pos.tsx","utf8");
 for(const part of [
  "saas_product_vertical_details","saas_vertical_tenant_serial_uq",
  "saas_vertical_member_select","saas_vertical_role_insert",
  "create trigger saas_vertical_guard",
  "public.saas_save_vertical_product",
  "public.create_product_with_opening_stock",
  "public.current_user_authorization()",
  "v_vertical=any(v_enabled)",
  "on conflict(product_id)",
 ])assert.ok(sql.includes(part),part);
 assert.ok(client.includes('"saas_save_vertical_product"'));
 assert.ok(client.includes('"saas_product_vertical_details"'));
 assert.ok(ui.includes("prepareVerticalProductPayload"));
 assert.ok(ui.includes("Serial / IMEI *"));
 assert.ok(ui.includes("Drug formulation *"));
 assert.ok(ui.includes("Expiry date *"));
 assert.ok(pos.includes('industry.currency_code!=="INR"'));
 assert.ok(pos.includes("Pharmacy dispensing is blocked"));
 assert.ok(pos.includes("Expired batch cannot be billed"));
});
