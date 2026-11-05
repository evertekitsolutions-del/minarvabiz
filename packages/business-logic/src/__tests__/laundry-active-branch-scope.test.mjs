import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);

const phase9 = require("../phase9-store.ts");
const phase5 = require("../phase5-store.ts");
const main = require("../store.ts");
const accounting = require("../accounting-store.ts");
const permissions = require("../permissions.ts");
const incidents = require("../laundry-incidents.ts");
const handover = require("../laundry-handover.ts");
const rates = require("../laundry-rate-cards.ts");
const stamp = "2026-11-05T10:00:00.000Z";
const head = "branch-hq", remote = "branch-two";
const branches = [
  {id:head,name:"Main Branch",code:"HQ",isHeadquarters:true,isActive:true,createdAt:stamp,updatedAt:stamp},
  {id:remote,name:"Second Branch",code:"B2",isHeadquarters:false,isActive:true,createdAt:stamp,updatedAt:stamp},
];
const customer = (id, branchId) => ({ id,name:id,branchId,outstandingBalance:10,totalSpending:0,createdAt:stamp,updatedAt:stamp});
const ticket = (id, branchId, customerId) => ({
  id,branchId,customerId,customerName:customerId,orderNumber:"LDY-"+id,
  mode:"in_house_ironing",quantity:1,status:"pending",customerRate:10,supplierRate:0,
  totalCustomerCharge:10,totalSupplierCost:0,paidAmount:0,balanceAmount:10,profit:10,
  createdAt:stamp,updatedAt:stamp,version:1,
});
const incident=(id,orderId)=>({
  id,orderId,itemTag:null,incidentType:"damage",description:"Damaged dress",status:"open",
  estimatedCustomerCompensation:10,estimatedVendorRecovery:0,resolutionNotes:null,createdAt:stamp,updatedAt:stamp,
});
const proof=(id,orderId,customerId,branchId)=>({
  id,orderId,customerId,branchId,leg:"pickup",acknowledgedBy:"Customer P",
  verificationMethod:"in_person_code",verifiedAt:stamp,
});
function setup(){
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({branches,activeBranchId:head});
  main.hydrateCore({customers:[customer("c-hq",head),customer("c-2",remote)],products:[],sales:[],payments:[]});
  const chart=accounting.exportAccountingState().accounts;
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  phase5.hydratePhase5({suppliers:[],laundryOrders:[ticket("hq-legacy",null,"c-hq"),ticket("b2",remote,"c-2")],expenses:[],purchases:[]});
  incidents.hydrateLaundryIncidents([incident("i-hq","hq-legacy"),incident("i-2","b2")]);
  handover.hydrateLaundryHandoverProofs([proof("p-hq","hq-legacy","c-hq",head),proof("p-2","b2","c-2",remote)]);
  rates.hydrateLaundryRateCards([]);
}
const rate={
  mode:"in_house_ironing",serviceCode:"steam_iron",garment:"Shirt",fabric:"cotton",
  supplierId:null,customerRate:20,supplierRate:0,tatHours:24,
};

test("legacy branchless tickets are HQ-only and branch 2 cannot read or mutate them",()=>{
  setup();
  assert.deepEqual(phase5.listLaundryOrders().map(x=>x.id),["hq-legacy"]);
  assert.deepEqual(incidents.listLaundryIncidents().map(x=>x.id),["i-hq"]);
  assert.deepEqual(handover.listLaundryHandoverProofs().map(x=>x.id),["p-hq"]);
  phase9.hydratePhase9({branches,activeBranchId:remote});
  assert.deepEqual(phase5.listLaundryOrders().map(x=>x.id),["b2"]);
  assert.deepEqual(incidents.listLaundryIncidents().map(x=>x.id),["i-2"]);
  assert.deepEqual(handover.listLaundryHandoverProofs().map(x=>x.id),["p-2"]);
  assert.equal(phase5.updateLaundryStatus("hq-legacy","received").order,null);
  assert.equal(phase5.updateLaundryDetails("hq-legacy",{notes:"tamper"}).order,null);
  assert.equal(phase5.cancelLaundryOrder({orderId:"hq-legacy",reason:"tamper attempt"}).order,null);
  assert.throws(()=>incidents.decideLaundryIncident({id:"i-hq",status:"rejected",notes:"cross branch"}),/active branch/i);
  assert.equal(incidents.exportLaundryIncidents().length,2,"backup must not drop other branch claims");
  assert.equal(handover.exportLaundryHandoverProofs().length,2,"backup must not drop other branch proof");
  phase9.hydratePhase9({branches,activeBranchId:head});
  assert.equal(phase5.listLaundryOrders()[0].status,"pending");
});

test("each branch receives its own supplier/garment service rates; a legacy rate maps to HQ",()=>{
  setup();
  const old=rates.saveLaundryRateCard({...rate,customerRate:25});
  assert.equal(old.branchId,head);
  phase9.hydratePhase9({branches,activeBranchId:remote});
  assert.equal(rates.listLaundryRateCards().length,0);
  assert.equal(rates.findLaundryRateCard(rate),null);
  const branch2=rates.saveLaundryRateCard({...rate,customerRate:40});
  assert.equal(branch2.branchId,remote);
  assert.notEqual(branch2.id,old.id);
  assert.equal(rates.findLaundryRateCard(rate)?.customerRate,40);
  assert.equal(rates.listLaundryRateCards().length,1);
  assert.equal(rates.exportLaundryRateCards().length,2,"snapshot must preserve all branch prices");
  phase9.hydratePhase9({branches,activeBranchId:head});
  assert.equal(rates.listLaundryRateCards().length,1);
  assert.equal(rates.findLaundryRateCard(rate)?.customerRate,25);
  const snapshot=rates.exportLaundryRateCards().map(v=>v.id===old.id?{...v,branchId:null}:v);
  rates.hydrateLaundryRateCards(snapshot);
  assert.equal(rates.findLaundryRateCard(rate)?.customerRate,25,"legacy unscoped tariff remains HQ");
});

test("branch mismatch customer intake rejected, same-branch intake stamps branch for sync",()=>{
  setup();
  phase9.hydratePhase9({branches,activeBranchId:remote});
  const draft=(customerId)=>({
    customerId,mode:"in_house_ironing",quantity:1,supplierRate:0,
    customerRate:25,paidAmount:0,paymentMethod:"cash",
  });
  const before=phase5.listLaundryOrders().length;
  const rejected=phase5.createLaundryOrder(draft("c-hq"));
  assert.equal(rejected.order,null);
  assert.match(rejected.errors.join(" "),/active branch/i);
  assert.equal(phase5.listLaundryOrders().length,before);
  const made=phase5.createLaundryOrder(draft("c-2"));
  assert.equal(made.errors.length,0,made.errors.join("; "));
  assert.equal(made.order?.branchId,remote);
  assert(phase5.listLaundryOrders().some(x=>x.id===made.order?.id));
  phase9.hydratePhase9({branches,activeBranchId:head});
  assert(!phase5.listLaundryOrders().some(x=>x.id===made.order?.id));
});

test("active branch denies cross-branch laundry receivable collection target",()=>{
  setup();
  phase9.hydratePhase9({branches,activeBranchId:remote});
  const result=main.recordCustomerPayment({
    customerId:"c-hq",amount:1,method:"cash",
    target:{sourceType:"laundry",id:"hq-legacy"},
  });
  assert.equal(result.payment,null);
  assert(result.errors.length>0);
  assert.equal(phase5.listLaundryOrders().length,1);
});

console.log("Laundry C5: active branch tickets, CRM support records, tariffs, backups and cross-branch collection boundaries PASS");
