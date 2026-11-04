import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const custody=require("../laundry-handover.ts");
const phase5=require("../phase5-store.ts");
const roles=require("../permissions.ts");

function make(id,patch={}) {
  return {
    id,orderNumber:"LDY-"+id,customerId:"customer-1",branchId:"branch-1",mode:"outsourced",
    status:"pending",items:[{id:"garment-"+id,label:"Shirt",tagCode:"TAG-"+id,quantity:1,
      qualityStatus:"pending",processingStatus:"received"}],
    deletedAt:null,createdAt:"2026-11-01T00:00:00Z",updatedAt:"2026-11-01T00:00:00Z",version:1,
    ...patch,
  };
}
function reset(orders) {
  roles.setCurrentRole("admin");
  roles.setRuntimeFeaturePolicy(null);
  custody.hydrateLaundryHandoverProofs([]);
  phase5.hydratePhase5({laundryOrders:orders,suppliers:[]});
}
test("pending pickup requires a fresh six-digit challenge, records proof without retaining code",()=>{
  reset([make("p")]);
  const issued=custody.issueLaundryHandoverCode("p","pickup");
  assert.match(issued.code,/^\d{6}$/);
  assert.equal(custody.issueLaundryHandoverCode("p","pickup").code,issued.code);
  assert.throws(()=>custody.verifyLaundryHandoverCode({
    orderId:"p",leg:"pickup",code:"wrong",acknowledgedBy:"Customer P",
  }),/six-digit/i);
  const proof=custody.verifyLaundryHandoverCode({
    orderId:"p",leg:"pickup",code:issued.code,acknowledgedBy:"Customer P",
  });
  assert.equal(proof.customerId,"customer-1");
  assert.equal(proof.branchId,"branch-1");
  assert.equal(proof.verificationMethod,"in_person_code");
  const serialized=JSON.stringify(custody.exportLaundryHandoverProofs());
  assert(!serialized.includes(issued.code));
  assert(!serialized.includes("expiresAt"));
  assert.throws(()=>custody.issueLaundryHandoverCode("p","pickup"),/already recorded/i);
});
test("customer dropoff requires returned outsourced laundry and all garments QC passed",()=>{
  reset([make("q")]);
  assert.throws(()=>custody.issueLaundryHandoverCode("q","dropoff"),/received back/i);
  phase5.hydratePhase5({laundryOrders:[make("q",{status:"received"})]});
  assert.throws(()=>custody.issueLaundryHandoverCode("q","dropoff"),/QC/i);
  const ready=make("q",{status:"received",items:[{
    id:"q-1",tagCode:"TAG-q",label:"Suit",quantity:1,
    qualityStatus:"passed",processingStatus:"ready",
  }]});
  phase5.hydratePhase5({laundryOrders:[ready]});
  const code=custody.issueLaundryHandoverCode("q","dropoff").code;
  const proof=custody.verifyLaundryHandoverCode({
    orderId:"q",leg:"dropoff",code,acknowledgedBy:"Customer Q",
  });
  assert.equal(proof.leg,"dropoff");
  assert.equal(phase5.listLaundryOrders().find(x=>x.id==="q")?.status,"received",
    "customer acknowledgment must never silently mark the ticket delivered");
});
test("five incorrect attempts lock a code; a reissued code cannot validate stale challenge",()=>{
  reset([make("attempt")]);
  const issued=custody.issueLaundryHandoverCode("attempt","pickup");
  const wrong=issued.code==="000000"?"000001":"000000";
  for(let i=0;i<5;i++)assert.throws(()=>custody.verifyLaundryHandoverCode({
    orderId:"attempt",leg:"pickup",code:wrong,acknowledgedBy:"Recipient",
  }),/Incorrect code/);
  assert.throws(()=>custody.verifyLaundryHandoverCode({
    orderId:"attempt",leg:"pickup",code:issued.code,acknowledgedBy:"Recipient",
  }),/expired or too many/i);
  const reissued=custody.issueLaundryHandoverCode("attempt","pickup");
  assert.match(reissued.code,/^\d{6}$/);
});
test("backup validation rejects duplicate, malformed and forged receipt archives",()=>{
  reset([make("back")]);
  let proof=custody.verifyLaundryHandoverCode({
    orderId:"back",leg:"pickup",code:custody.issueLaundryHandoverCode("back","pickup").code,
    acknowledgedBy:"Recipient",
  });
  let snapshot=custody.exportLaundryHandoverProofs();
  custody.hydrateLaundryHandoverProofs([]);
  custody.hydrateLaundryHandoverProofs(snapshot);
  assert.equal(custody.listLaundryHandoverProofs("back").length,1);
  assert.throws(()=>custody.validateLaundryHandoverProofs([proof,proof]),/invalid/i);
  assert.throws(()=>custody.validateLaundryHandoverProofs([{...proof,verificationMethod:"sms"}]),/invalid/i);
  assert.throws(()=>custody.validateLaundryHandoverProofs([{...proof,acknowledgedBy:""}]),/invalid/i);
});
test("shared route UI and Windows snapshot include manual customer acknowledgment",()=>{
  const route=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryRoutePanel.tsx",import.meta.url),"utf8");
  const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryHandoverAction.tsx",import.meta.url),"utf8");
  const snap=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(route,/LaundryHandoverAction/);
  assert.match(panel,/no SMS\/WhatsApp is sent/);
  assert.match(snap,/laundryHandoverProofs: laundryHandover\.exportLaundryHandoverProofs/);
  assert.match(snap,/validateLaundryHandoverProofs/);
  assert.match(snap,/hydrateLaundryHandoverProofs/);
});
