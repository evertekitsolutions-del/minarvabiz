import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);

const orders=require("../orders-store.ts");
const store=require("../store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");
const phase7=require("../phase7-store.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
store.hydrateCore({
  customers:[
    {id:"c1",name:"Alpha Customer",outstandingBalance:0,totalSpending:0,createdAt:"2026-09-01",updatedAt:"2026-09-01"},
    {id:"c2",name:"Beta Customer",outstandingBalance:0,totalSpending:0,createdAt:"2026-09-01",updatedAt:"2026-09-01"},
  ],
  products:[],sales:[],payments:[]
});
orders.hydrateOrders({
  measurements:[],
  orders:[
    {id:"o1",orderNumber:"ORD-1",customerId:"c1",customerName:"Alpha Customer",orderDate:"2026-09-10T10:00:00.000Z",deliveryDate:"2026-09-20",serviceType:"ladies_tailoring",status:"pending",customerSuppliedMaterial:false,shopSuppliedMaterial:true,price:100,discount:0,advance:0,balance:100,externalMaterialCost:0,orderExpensesTotal:0,quantity:1,unitPrice:100,bulkDiscount:0,tshirt:null,expenses:[],notes:"Original",materialDetails:"Blue fabric",createdAt:"2026-09-10T10:00:00.000Z",updatedAt:"2026-09-10T10:00:00.000Z",version:1},
    {id:"o2",orderNumber:"ORD-2",customerId:"c2",customerName:"Beta Customer",orderDate:"2026-09-15T10:00:00.000Z",deliveryDate:"2026-10-02",serviceType:"gents_tailoring",status:"delivered",customerSuppliedMaterial:false,shopSuppliedMaterial:true,price:200,discount:0,advance:0,balance:200,externalMaterialCost:0,orderExpensesTotal:0,quantity:1,unitPrice:200,bulkDiscount:0,tshirt:null,expenses:[],notes:null,materialDetails:null,createdAt:"2026-09-15T10:00:00.000Z",updatedAt:"2026-09-15T10:00:00.000Z",version:1},
  ]
});

assert.deepEqual(orders.listOrders({customerId:"c1"}).map(o=>o.id),["o1"]);
assert.deepEqual(orders.listOrders({orderDateFrom:"2026-09-12"}).map(o=>o.id),["o2"]);
assert.deepEqual(orders.listOrders({orderDateTo:"2026-09-12"}).map(o=>o.id),["o1"]);
assert.deepEqual(orders.listOrders({deliveryDateFrom:"2026-10-01"}).map(o=>o.id),["o2"]);
assert.deepEqual(orders.listOrders({deliveryDateTo:"2026-09-30"}).map(o=>o.id),["o1"]);

let edited=orders.updateOrderOperationalDetails("o1",{deliveryDate:"2026-09-25",notes:"Updated notes",materialDetails:"Green fabric"},"Customer requested reschedule");
assert.deepEqual(edited.errors,[]);
assert.equal(edited.order.deliveryDate,"2026-09-25");
assert.equal(edited.order.notes,"Updated notes");
assert.equal(edited.order.materialDetails,"Green fabric");
assert.equal(edited.order.price,100);
assert.equal(edited.order.balance,100);
assert.equal(edited.order.version,2);

assert.match(orders.updateOrderOperationalDetails("o1",{deliveryDate:"2026-09-26"},"").errors.join(";"),/reason is required/i);
assert.match(orders.updateOrderOperationalDetails("o1",{deliveryDate:"2026-09-25",notes:"Updated notes",materialDetails:"Green fabric"},"No change").errors.join(";"),/No operational changes/i);
assert.match(orders.updateOrderOperationalDetails("o2",{deliveryDate:"2026-10-03"},"Customer request").errors.join(";"),/immutable/i);

outbox.hydrateOutbox([]);
const progressed=orders.updateOrderStatus("o1","processing");
assert(progressed.order);
assert.equal(progressed.order.status,"processing");
assert(outbox.listPendingOutbox().some(event=>event.aggregateType==="orders"&&event.aggregateId==="o1"));

await new Promise(resolve=>setTimeout(resolve,0));
const history=phase7.listAuditLogs(100).filter(entry=>entry.recordId==="o1"&&entry.tableName==="orders");
assert(history.some(entry=>entry.action==="service_order.update"));
assert(history.some(entry=>entry.action==="service_order.status"));

console.log("Service order record management PASS");
