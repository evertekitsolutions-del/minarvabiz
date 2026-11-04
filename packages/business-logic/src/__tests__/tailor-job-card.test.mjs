import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const { buildTailorJobCardHtml }=require("../tailor-job-card.ts");
const order={
  id:"order-job",orderNumber:"ORD-0001",customerId:"customer-job",
  customerName:"Asha <script>alert(1)</script>",orderDate:"2026-11-04",
  deliveryDate:"2026-11-11",serviceType:"ladies_tailoring",status:"stitching",
  measurements:{chest:36,waist:29},measurementProfileId:"profile-old",quantity:2,
  notes:"Blue & gold lace",materialDetails:"Silk < 3m",customerSuppliedMaterial:true,shopSuppliedMaterial:false,
};
test("A4 tailor card includes posted measurements, assigned staff, due date and safe text",()=>{
  const html=buildTailorJobCardHtml(order,{
    shopName:"Minarva <Boutique>",
    measurements:{id:"profile-old",customerId:"customer-job",fields:{chest:40,length:38}},
    assignments:[{id:"a",staffId:"s",orderId:"order-job",staffName:"Tailor <Anu>",
      status:"in_progress",notes:"Check & iron"},{id:"b",staffId:"x",orderId:"other",status:"assigned"}],
  });
  assert.match(html,/@page\{size:A4/);
  assert.match(html,/TAILOR \/ PRODUCTION JOB CARD/);
  assert.match(html,/ORD-0001/);
  assert.match(html,/2026-11-11/);
  assert.match(html,/36/);
  assert.doesNotMatch(html,/chest<\/td><td>40/);
  assert.match(html,/Tailor &lt;Anu&gt;/);
  assert.match(html,/Minarva &lt;Boutique&gt;/);
  assert.match(html,/Silk &lt; 3m/);
  assert.match(html,/Blue &amp; gold lace/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html,/>Tailor x</);
});
test("historic measurement profile is included only if posted measurements are empty and belongs to same customer",()=>{
  const noFields={...order,measurements:{}};
  const current={id:"profile-old",customerId:"customer-job",fields:{waist:30},label:"Latest"};
  assert.match(buildTailorJobCardHtml(noFields,{measurements:current}),/30/);
  assert.doesNotMatch(buildTailorJobCardHtml(noFields,{measurements:{...current,customerId:"another"}}),/waist<\/td><td>30/i);
});
test("shared order details reuses existing print preview instead of a new document engine",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/orders/OrderDetail.tsx",import.meta.url),"utf8");
  assert.match(ui,/Preview Tailor Job Card/);
  assert.match(ui,/buildTailorJobCardHtml/);
  assert.match(ui,/PrintPreviewModal/);
  assert.throws(()=>buildTailorJobCardHtml({}),/valid posted service order/);
});
