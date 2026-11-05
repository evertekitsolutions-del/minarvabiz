import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const rate = require("../laundry-rate-cards.ts");
const csv = require("../laundry-rate-cards-csv.ts");
const phase9 = require("../phase9-store.ts");
const permissions = require("../permissions.ts");
const stamp = "2026-11-05T00:00:00.000Z";
const HQ = "hq", OTHER = "other";
const branches = [
  {id:HQ,name:"Headquarters",code:"HQ",isHeadquarters:true,isActive:true,createdAt:stamp,updatedAt:stamp},
  {id:OTHER,name:"Other",code:"OTHER",isHeadquarters:false,isActive:true,createdAt:stamp,updatedAt:stamp},
];
const header = "mode,service,garment,fabric,supplier_id,customer_rate,supplier_rate,tat_hours\r\n";
const row = "outsourced,dry_clean,Silk Saree,silk,supplier-1,250.50,100.25,48\r\n";
function setup() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({branches,activeBranchId:HQ});
  rate.hydrateLaundryRateCards([]);
}
test("rate catalog CSV roundtrip preserves supplier rate, fabric and precision",()=>{
  setup();
  const parsed = csv.previewLaundryRateCardCsv(header+row);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.rows[0].customerRate,250.5);
  assert.equal(parsed.rows[0].supplierId,"supplier-1");
  assert.deepEqual(csv.importLaundryRateCardCsv(header+row,HQ),{created:1,updated:0,errors:[]});
  const exported=csv.exportLaundryRateCardCsv();
  assert.match(exported,/Silk Saree,silk,supplier-1,250.5,100.25,48/);
  const again=csv.previewLaundryRateCardCsv(exported);
  assert.deepEqual(again.errors,[]);
  assert.deepEqual(csv.importLaundryRateCardCsv(exported,HQ),{created:0,updated:1,errors:[]});
  assert.equal(rate.listLaundryRateCards().length,1);
});
test("batch upsert validates full CSV before mutating and preserves rate IDs",()=>{
  setup();
  const first=csv.importLaundryRateCardCsv(header+row,HQ);
  assert.equal(first.created,1);
  const original=rate.listLaundryRateCards()[0];
  const update="outsourced,dry_clean,Silk Saree,silk,supplier-1,300,120,36\r\n";
  const added="in_house_ironing,steam_iron,Shirt,cotton,,70,0,24\r\n";
  assert.deepEqual(csv.importLaundryRateCardCsv(header+update+added,HQ),{created:1,updated:1,errors:[]});
  assert.equal(rate.listLaundryRateCards().length,2);
  const changed=rate.listLaundryRateCards().find(x=>x.mode==="outsourced");
  assert.equal(changed.id,original.id);
  assert.equal(changed.customerRate,300);
  const before=JSON.stringify(rate.exportLaundryRateCards());
  assert(csv.importLaundryRateCardCsv(header+update+added.replace("70,0,24","70,2,24"),HQ).errors.length);
  assert.equal(JSON.stringify(rate.exportLaundryRateCards()),before);
});
test("active branch lock prevents stale import and keeps HQ rates isolated",()=>{
  setup();
  const text=header+row;
  const before=csv.previewLaundryRateCardCsv(text);
  assert.equal(before.rows.length,1);
  phase9.hydratePhase9({branches,activeBranchId:OTHER});
  const refused=csv.importLaundryRateCardCsv(text,HQ);
  assert.match(refused.errors.join(" "),/branch changed/i);
  assert.equal(rate.exportLaundryRateCards().length,0);
  assert.deepEqual(csv.importLaundryRateCardCsv(text,OTHER),{created:1,updated:0,errors:[]});
  phase9.hydratePhase9({branches,activeBranchId:HQ});
  assert.equal(rate.listLaundryRateCards().length,0);
  assert.match(csv.exportLaundryRateCardCsv(),/^mode,service,garment/);
  phase9.hydratePhase9({branches,activeBranchId:OTHER});
  assert.equal(rate.listLaundryRateCards().length,1);
});
test("strict CSV rejects malicious money cells, duplicate rates, malformed quotes and oversized input",()=>{
  setup();
  const values=[
    header+row+row,
    header+row.replace("250.50","=1+2"),
    header+row.replace("48\r\n","0\r\n"),
    header+row.replace("100.25","100.123"),
    header+row.replace("supplier-1","s1\"evil"),
    header+row.replace("dry_clean","unsupported_service"),
    header+row.replace("outsourced","in_house_ironing"),
    header+"outsourced,dry_clean,\"Unclosed,silk,supplier-1,250,100,24",
    header+"outsourced,dry_clean,Bad,silk,supplier-1,NaN,100,24\r\n",
    "X".repeat(2*1024*1024+1),
  ];
  for (const value of values) {
    const result=csv.previewLaundryRateCardCsv(value);
    assert(result.errors.length>0,"Expected rejection: "+value.slice(0,100));
    const imported=csv.importLaundryRateCardCsv(value,HQ);
    assert(imported.errors.length>0);
    assert.equal(rate.exportLaundryRateCards().length,0);
  }
});
test("quoted multiline garment names are handled; formula-like CSV text exports inert",()=>{
  setup();
  const row='outsourced,dry_clean,"Saree, Cotton\nCare",cotton,,120,55,72\r\n';
  const parsed=csv.previewLaundryRateCardCsv(header+row);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows[0].garment,"Saree, Cotton\nCare");
  const exportCsv=csv.exportLaundryRateCardCsv([{
    id:"a",mode:"outsourced",serviceCode:"wash",garment:' =HYPERLINK("x")',fabric:"regular",
    supplierId:null,branchId:HQ,customerRate:10,supplierRate:5,tatHours:24,updatedAt:stamp,
  }]);
  assert.match(exportCsv,/"' =HYPERLINK\(""x""\)"/);
});
test("cashier cannot import even a valid CSV",()=>{
  setup();
  permissions.setCurrentRole("cashier");
  const result=csv.importLaundryRateCardCsv(header+row,HQ);
  assert.match(result.errors.join(" "),/permission denied/i);
  assert.equal(rate.exportLaundryRateCards().length,0);
  permissions.setCurrentRole("admin");
});
test("shared Windows/Web UI exposes explicit preview and confirmation, not auto-import",()=>{
  const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryRateCatalogPanel.tsx",import.meta.url),"utf8");
  const list=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  assert.match(panel,/previewLaundryRateCardCsv/);
  assert.match(panel,/Import \{pending.count\} validated rates/);
  assert.match(panel,/currentLaundryRateCatalogBranchId/);
  assert.match(panel,/URL\.revokeObjectURL/);
  assert.match(list,/<LaundryRateCatalogPanel/);
});
