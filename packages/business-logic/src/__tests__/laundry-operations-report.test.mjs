import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const { buildLaundryOperationsReport }=require("../laundry-operations-report.ts");
const make=(id,patch={})=>({
  id, createdAt:"2026-11-02T12:00:00Z",updatedAt:"2026-11-02T12:00:00Z",
  mode:"outsourced",status:"received",quantity:1,dueAt:"2026-11-03",
  totalCustomerCharge:150,totalSupplierCost:100,items:[{
    id:id+"i",tagCode:id+"t",label:"Shirt",quantity:1,serviceCode:"wash",processingStatus:"quality_check",qualityStatus:"failed",
  }],...patch,
});
test("ticket booking, stage volumes, QC failures, service mix and overdue counted once",()=>{
  const orders=[
    make("a",{quantity:2,totalCustomerCharge:300,totalSupplierCost:200,items:[{
      id:"ai",label:"Saree",tagCode:"at",quantity:2,serviceCode:"dry_clean",processingStatus:"ironing",qualityStatus:"pending",
    }]}),
    make("b",{status:"delivered",dueAt:"2026-11-02",mode:"in_house_ironing",totalSupplierCost:0,
      items:[{id:"bi",label:"Shirt",quantity:1,serviceCode:"steam_iron",processingStatus:"delivered",qualityStatus:"passed"}]}),
    make("c",{status:"cancelled",totalCustomerCharge:5000,totalSupplierCost:5000}),
    make("other-month",{createdAt:"2026-10-31",totalCustomerCharge:5000}),
  ];
  const before=JSON.stringify(orders);
  const result=buildLaundryOperationsReport([...orders,orders[0]],"2026-11-01","2026-11-30","2026-11-04");
  assert.equal(result.bookedTickets,2);
  assert.equal(result.activeTickets,1);
  assert.equal(result.deliveredTickets,1);
  assert.equal(result.overdueOpenTickets,1);
  assert.equal(result.outsourcedTickets,1);
  assert.equal(result.inHouseTickets,1);
  assert.equal(result.garmentPieces,3);
  assert.equal(result.deliveredGarmentPieces,1);
  assert.equal(result.stages.ironing,2);
  assert.equal(result.stages.delivered,1);
  assert.equal(result.bookedCustomerCharge,450);
  assert.equal(result.supplierCommitment,200);
  assert.equal(result.contributionBeforeOverhead,250);
  assert.deepEqual(result.serviceVolumes.map(x=>[x.service,x.garmentCount,x.tickets]),[
    ["dry_clean",2,1],["steam_iron",1,1],
  ]);
  assert.equal(JSON.stringify(orders),before);
});
test("legacy unitemized ticket reports unspecified services without pretending QC passed",()=>{
  const result=buildLaundryOperationsReport([make("legacy",{items:undefined})],"2026-11-01","2026-11-30","2026-11-04");
  assert.equal(result.stages.untracked,1);
  assert.equal(result.deliveredGarmentPieces,0);
  assert.equal(result.serviceVolumes[0].service,"unspecified");
});
test("invalid dates, amounts and garment quantities fail closed",()=>{
  assert.throws(()=>buildLaundryOperationsReport([],"2026-02-31","2026-11-30","2026-11-04"),/valid YYYY-MM-DD/i);
  assert.throws(()=>buildLaundryOperationsReport([],"2026-11-30","2026-11-01","2026-11-04"),/start date/i);
  assert.throws(()=>buildLaundryOperationsReport([make("bad",{quantity:NaN})],"2026-11-01","2026-11-30","2026-11-04"),/garment quantity/i);
  assert.throws(()=>buildLaundryOperationsReport([make("bad",{totalCustomerCharge:NaN})],"2026-11-01","2026-11-30","2026-11-04"));
});
test("shared desktop/web UI exposes real operational reports",()=>{
  const list=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryOperationsPanel.tsx",import.meta.url),"utf8");
  assert.match(list,/LaundryOperationsPanel/);
  assert.match(panel,/buildLaundryOperationsReport/);
  assert.match(panel,/Laundry reporting month/);
  assert.match(panel,/not the reconciled financial ledger/i);
});

test("empty reporting period produces zero booked and delivered tickets",()=>{
  const report=buildLaundryOperationsReport([],"2026-11-01","2026-11-30","2026-11-04");
  assert.equal(report.bookedTickets,0);
  assert.equal(report.deliveredTickets,0);
  assert.equal(report.overdueOpenTickets,0);
});
