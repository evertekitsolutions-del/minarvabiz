import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,p);
const store=require("../store.ts");
const orders=require("../orders-store.ts");
const phase5=require("../phase5-store.ts");
const phase6=require("../phase6-store.ts");
const date="2026-11-04T01:00:00.000Z";
store.hydrateCore({customers:[{id:"c",name:"Example",outstandingBalance:0,totalSpending:0,createdAt:date,updatedAt:date}],products:[],sales:[],payments:[]});
orders.hydrateOrders({orders:[{id:"tailor-1",customerId:"c",orderNumber:"ORD-1",orderDate:date,createdAt:date,status:"cutting",price:30}],measurements:[{id:"m1",customerId:"c",label:"Standard",fields:{chest:32},recordedAt:date,createdAt:date,updatedAt:date}]});
phase5.hydratePhase5({suppliers:[],laundryOrders:[{id:"l1",customerId:"c",orderNumber:"LDY-1",garment:"Shirt",status:"pending",mode:"in_house_ironing",totalCustomerCharge:20,createdAt:date,updatedAt:date}],expenses:[],purchases:[]});
let profile=phase6.getCustomerCrmProfile("c");
assert(profile);
assert.equal(profile.orderCount,1);
assert.equal(profile.measurementCount,1);
assert.equal(profile.laundryCount,1);
assert.deepEqual(profile.recentLaundry.map(x=>[x.orderNumber,x.garment,x.total]),[["LDY-1","Shirt",20]]);
assert.equal(phase6.getCustomerCrmProfile("missing"),null);
console.log("CRM united tailoring + saved measurements + laundry history PASS");
