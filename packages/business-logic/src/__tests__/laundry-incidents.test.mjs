import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const incidents=require("../laundry-incidents.ts");
const phase5=require("../phase5-store.ts");
const core=require("../store.ts");
const phase7=require("../phase7-store.ts");
const accounting=require("../accounting-store.ts");
const permissions=require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
core.hydrateCore({customers:[{id:"customer-inc",name:"Claims customer",outstandingBalance:0,totalSpending:0,
  createdAt:"2026-01-01",updatedAt:"2026-01-01"}],products:[],sales:[],payments:[]});
phase5.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
phase7.hydratePhase7({returns:[],auditLogs:[]});
incidents.hydrateLaundryIncidents([]);
const ticket=phase5.createLaundryOrder({customerId:"customer-inc",mode:"in_house_ironing",
  quantity:1,items:[{label:"Coat",quantity:1}],supplierRate:0,customerRate:120});
assert.equal(ticket.errors.length,0,ticket.errors.join("; "));
const beforeLedger=JSON.stringify(accounting.exportAccountingState().journals);
const tag=ticket.order.items[0].tagCode;
test("record garment damage, resolve once, audit and snapshot",async()=>{
  const created=incidents.registerLaundryIncident({orderId:ticket.order.id,itemTag:tag,
    incidentType:"damage",description:"Seam damaged",estimatedCustomerCompensation:75});
  assert.equal(created.status,"open");
  assert.equal(created.itemTag,tag);
  assert.equal(created.estimatedCustomerCompensation,75);
  assert.throws(()=>incidents.decideLaundryIncident({id:created.id,status:"resolved",notes:""}),/resolution explanation/i);
  assert.equal(incidents.decideLaundryIncident({id:created.id,status:"resolved",notes:"Claim accepted"}).status,"resolved");
  assert.throws(()=>incidents.decideLaundryIncident({id:created.id,status:"resolved",notes:"Again"}),/already finalized/i);
  const saved=incidents.exportLaundryIncidents();
  incidents.hydrateLaundryIncidents([]);
  assert.equal(incidents.listLaundryIncidents().length,0);
  incidents.hydrateLaundryIncidents(saved);
  assert.deepEqual(incidents.exportLaundryIncidents(),saved);
  assert.equal(JSON.stringify(accounting.exportAccountingState().journals),beforeLedger);
  for(let attempt=0;attempt<40&&!phase7.listAuditLogs(50).some(event=>event.action==="laundry.incident_open");attempt++) {
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert(phase7.listAuditLogs(50).some(event=>event.action==="laundry.incident_open"));
  assert(phase7.listAuditLogs(50).some(event=>event.action==="laundry.incident_decide"));
});
test("invalid garment tags, vendor claims and corrupted archives fail closed",()=>{
  const base={orderId:ticket.order.id,incidentType:"lost",description:"Lost tag"};
  assert.throws(()=>incidents.registerLaundryIncident({...base,itemTag:"FOREIGN"}),/does not belong/i);
  assert.throws(()=>incidents.registerLaundryIncident({...base,estimatedVendorRecovery:40}),/no vendor recovery/i);
  assert.throws(()=>incidents.registerLaundryIncident({...base,estimatedCustomerCompensation:-5}),/non-negative/i);
  assert.throws(()=>incidents.validateLaundryIncidents([...incidents.exportLaundryIncidents(),
    ...incidents.exportLaundryIncidents()]),/invalid laundry incident fields/i);
});
test("non-manager permissions and shared UI wiring",()=>{
  permissions.setCurrentRole("tailor");
  assert.throws(()=>incidents.registerLaundryIncident({
    orderId:ticket.order.id,incidentType:"rework",description:"Fix pleats",
  }),/permission denied/i);
  permissions.setCurrentRole("admin");
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  const snap=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(ui,/LaundryIncidentsPanel/);
  assert.match(snap,/laundryIncidents: laundryIncidents\.exportLaundryIncidents/);
  assert.match(snap,/hydrateLaundryIncidents/);
});
