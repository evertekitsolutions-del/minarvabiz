import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const databaseRequire = createRequire(new URL("../../../database/package.json", import.meta.url));
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);
const adapter = require("../sales-order-sqlite.ts");
const SQL = await databaseRequire("sql.js/dist/sql-asm.js")();
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const auth = { organizationId: uuid(1), companyId: uuid(2), branchId: uuid(3),
  warehouseId: uuid(4), canManageSalesOrders: true };
const orderRequest = (extra={}) => ({
  organizationId:auth.organizationId, companyId:auth.companyId, branchId:auth.branchId,
  warehouseId:auth.warehouseId, id:uuid(5),operationId:uuid(6),
  orderNumber:"SO-001",customerId:uuid(7),currency:"INR",
  createdAt:"2026-10-21T08:00:00.000Z",
  lines:[{id:uuid(8),productId:uuid(9),description:"Paper",
    quantityMilli:2000,unitPriceMinor:500,discountMinor:0,taxMinor:0}],
  ...extra,
});
const verifyReferences = (_conn, intent) => {
  if (intent.customerId !== uuid(7) ||
    intent.lines.some((line) => line.productId !== uuid(9))) {
    throw new Error("Authoritative customer or product reference not found");
  }
  return true;
};
const create = (conn,req,a,enabled) =>
  adapter.createSalesOrderSqlite(conn,req,a,enabled,verifyReferences);
const amend = (conn,id,req,a,enabled) =>
  adapter.amendSalesOrderSqlite(conn,id,req,a,enabled,verifyReferences);
const transition = (conn,id,req,a,enabled,invoiceVerifier) =>
  adapter.transitionSalesOrderSqlite(conn,id,req,a,enabled,invoiceVerifier,verifyReferences);
function db() {
  const raw=new SQL.Database();
  const conn={
    exec(sql,params=[]){raw.run(sql,params);},
    query(sql,params=[]){const s=raw.prepare(sql);try{s.bind(params);const rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free()}},
    transaction(fn){raw.run("BEGIN IMMEDIATE");try{const x=fn();raw.run("COMMIT");return x;}catch(e){raw.run("ROLLBACK");throw e;}},
  };
  adapter.initializeSalesOrderSqlite(conn,true);
  return conn;
}
const txn=(id,action,expectedVersion,extra={})=>({operationId:uuid(id),action,expectedVersion,
  occurredAt:"2026-10-21T08:01:00.000Z",...extra});
test("SQL schema is opt-in and no table is created while feature disabled",()=>{
  const raw=new SQL.Database();
  const conn={exec(sql,p=[]){raw.run(sql,p)},query(){return []},transaction(fn){return fn()}};
  assert.throws(()=>adapter.initializeSalesOrderSqlite(conn),/disabled/);
  assert.equal(raw.exec("SELECT name FROM sqlite_master WHERE type='table'").length,0);
});
test("actual SQLite atomic create/replay and scope/list isolation",()=>{
  const conn=db();const first=create(conn,orderRequest(),auth,true);
  assert.equal(first.disposition,"new");
  assert.equal(create(conn,orderRequest(),auth,true).disposition,"replay");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,1);
  assert.equal(adapter.listSalesOrdersSqlite(conn,{...auth,branchId:uuid(80)},true).length,0);
  assert.throws(()=>create(conn,orderRequest({id:uuid(10),operationId:uuid(11)}),auth,true),/number already exists/);
  assert.throws(()=>create(conn,orderRequest({branchId:uuid(55)}),auth,true),/scope mismatch/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,1);
});
test("version compare-and-set and exact replay preserve one stored order",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  const next=transition(conn,uuid(5),txn(11,"confirm",1),auth,true);
  assert.equal(next.order.version,2);
  assert.equal(next.order.status,"confirmed");
  assert.equal(transition(conn,uuid(5),txn(11,"confirm",1),auth,true).disposition,"replay");
  assert.throws(()=>transition(conn,uuid(5),txn(12,"cancel",1),auth,true),/Stale/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].version,2);
  const cancelled=transition(conn,uuid(5),txn(12,"cancel",2),auth,true);
  assert.equal(cancelled.order.status,"cancelled");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].version,3);
});
test("SQL transaction rollback on invalid input, corrupt rows and unauthorized role",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  const before=JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true));
  assert.throws(()=>transition(conn,uuid(5),txn(11,"confirm",1),
    {...auth,canManageSalesOrders:false},true),/permission denied/);
  assert.throws(()=>create(conn,orderRequest({operationId:uuid(20),
    id:uuid(22),lines:[{...orderRequest().lines[0],quantityMilli:0}]}),auth,true),/positive/);
  assert.equal(JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true)),before);
  conn.exec("UPDATE retail_sales_order_intents_v1 SET version = 5 WHERE id = ?",[uuid(5)]);
  assert.throws(()=>adapter.listSalesOrdersSqlite(conn,auth,true),/identity or revision mismatch/);
});
test("committed invoice link is only accepted from matching recorded identity",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  transition(conn,uuid(5),txn(11,"confirm",1),auth,true);
  const sale={id:uuid(60),organizationId:auth.organizationId,companyId:auth.companyId,
    branchId:auth.branchId,customerId:uuid(7),currency:"INR",totalMinor:1000};
  assert.throws(()=>transition(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:sale}),auth,true),/Trusted invoice verification required/);
  const verify = (invoiceId, order) => invoiceId === sale.id &&
    order.customerId === sale.customerId && order.totalMinor === sale.totalMinor;
  assert.throws(()=>transition(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:sale}),auth,true,()=>false),/verification failed/);
  assert.throws(()=>transition(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:{...sale,branchId:uuid(20)}}),auth,true,verify),/does not match/);
  const result=transition(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:sale}),auth,true,verify);
  assert.equal(result.order.invoiceId,uuid(60));
  assert.equal(result.order.status,"invoiced");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].status,"invoiced");
});

test("one committed invoice cannot be linked to two orders within an org",()=>{
  const conn=db();
  create(conn,orderRequest(),auth,true);
  const second=orderRequest({id:uuid(30),operationId:uuid(31),orderNumber:"SO-002",
    lines:[{...orderRequest().lines[0],id:uuid(32)}]});
  create(conn,second,auth,true);
  const a=transition(conn,uuid(5),txn(40,"confirm",1),auth,true).order;
  const b=transition(conn,uuid(30),txn(41,"confirm",1),auth,true).order;
  assert.equal(a.status,"confirmed"); assert.equal(b.status,"confirmed");
  const inv={id:uuid(50),organizationId:auth.organizationId,companyId:auth.companyId,
    branchId:auth.branchId,customerId:uuid(7),currency:"INR",totalMinor:1000};
  const verifier=()=>true;
  transition(conn,uuid(5),txn(42,"link-invoice",2,
    {committedInvoice:inv}),auth,true,verifier);
  assert.throws(()=>transition(conn,uuid(30),txn(43,"link-invoice",2,
    {committedInvoice:inv}),auth,true,verifier),/UNIQUE constraint failed/);
  const saved=adapter.listSalesOrdersSqlite(conn,auth,true);
  assert.deepEqual(saved.map(x=>x.status).sort(),["confirmed","invoiced"]);
});
test("an invoice-linked retry still requires trusted verifier and cannot bypass scope",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  transition(conn,uuid(5),txn(61,"confirm",1),auth,true);
  const inv={id:uuid(60),organizationId:auth.organizationId,companyId:auth.companyId,
    branchId:auth.branchId,customerId:uuid(7),currency:"INR",totalMinor:1000};
  const t=txn(62,"link-invoice",2,{committedInvoice:inv});
  transition(conn,uuid(5),t,auth,true,()=>true);
  assert.throws(()=>transition(conn,uuid(5),t,auth,true),/verification required/);
  assert.throws(()=>transition(conn,uuid(5),t,auth,true,()=>false),/verification failed/);
  assert.equal(transition(conn,uuid(5),t,auth,true,()=>true).disposition,"replay");
});

test("SQLite draft amendment CAS persists replacement totals and survives retry",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  const original=adapter.listSalesOrdersSqlite(conn,auth,true)[0];
  const input={operationId:uuid(73),expectedVersion:1,occurredAt:"2026-10-21T08:01:00.000Z",
    lines:[{...orderRequest().lines[0],quantityMilli:3000}],note:"Restock",
    dueDate:"2026-11-06"};
  const changed=amend(conn,uuid(5),input,auth,true);
  assert.equal(changed.disposition,"update");
  assert.equal(changed.order.totalMinor,1500);
  assert.equal(original.totalMinor,1000);
  assert.equal(amend(conn,uuid(5),input,auth,true).disposition,"replay");
  assert.throws(()=>amend(conn,uuid(5),{...input,operationId:uuid(74)},auth,true),/Stale/);
  assert.throws(()=>amend(conn,uuid(5),{...input,operationId:uuid(74),
    expectedVersion:2,lines:[{...orderRequest().lines[0],quantityMilli:0}]},auth,true),/positive/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].totalMinor,1500);
  transition(conn,uuid(5),txn(75,"confirm",2),auth,true);
  assert.throws(()=>amend(conn,uuid(5),{...input,
    operationId:uuid(76),expectedVersion:3},auth,true),/Only an active draft/);
});

test("unverified and unknown customer/SKU references reject before SQLite commit",()=>{
  const conn=db();
  assert.throws(()=>adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true),
    /Trusted customer\/product\/warehouse reference verification required/);
  assert.throws(()=>adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true,()=>false),
    /verification denied/);
  assert.throws(()=>create(conn,orderRequest({customerId:uuid(55)}),auth,true),
    /reference not found/);
  assert.throws(()=>create(conn,orderRequest({lines:[
    {...orderRequest().lines[0],productId:uuid(55)}]}),auth,true),/reference not found/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,0);
  create(conn,orderRequest(),auth,true);
  assert.throws(()=>adapter.amendSalesOrderSqlite(conn,uuid(5),{
    operationId:uuid(63),expectedVersion:1,occurredAt:"2026-10-21T08:01:00.000Z",
    lines:orderRequest().lines},auth,true),/Trusted customer\/product\/warehouse reference verification required/);
  assert.throws(()=>amend(conn,uuid(5),{
    operationId:uuid(64),expectedVersion:1,occurredAt:"2026-10-21T08:01:00.000Z",
    lines:[{...orderRequest().lines[0],productId:uuid(22)}]},auth,true),/reference not found/);
  assert.throws(()=>adapter.amendSalesOrderSqlite(conn,uuid(5),{
    operationId:uuid(65),expectedVersion:1,occurredAt:"2026-10-21T08:01:00.000Z",
    lines:orderRequest().lines},auth,true,()=>false),/verification denied/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].version,1);
});

test("SQLite original create replay after a draft amendment returns its current revision",()=>{
  const conn=db();
  create(conn,orderRequest(),auth,true);
  amend(conn,uuid(5),{
    operationId:uuid(92),expectedVersion:1,occurredAt:"2026-10-21T08:03:00.000Z",
    lines:[{...orderRequest().lines[0],quantityMilli:4000}],
    note:"Amended delivery",dueDate:"2026-11-18",
  },auth,true);
  const retry=create(conn,orderRequest(),auth,true);
  assert.equal(retry.disposition,"replay");
  assert.equal(retry.order.version,2);
  assert.equal(retry.order.totalMinor,2000);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,1);
  assert.throws(()=>create(conn,orderRequest({
    lines:[{...orderRequest().lines[0],quantityMilli:4000}]
  }),auth,true),/payload conflict/);
});

test("confirmation requires current verified master references, including on replay",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  const confirm=txn(98,"confirm",1);
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),confirm,auth,true),
    /reference verification required/);
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),confirm,auth,true,
    undefined,()=>false),/verification denied confirmation/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].status,"draft");
  const result=transition(conn,uuid(5),confirm,auth,true);
  assert.equal(result.order.status,"confirmed");
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),confirm,auth,true),
    /reference verification required/);
  assert.equal(transition(conn,uuid(5),confirm,auth,true).disposition,"replay");
});

test("transactional offline event staging records exactly one event per accepted order revision",()=>{
  const conn=db();
  assert.equal(adapter.listPendingSalesOrderEventsSqlite(conn,auth,true).length,0);
  create(conn,orderRequest(),auth,true);
  create(conn,orderRequest(),auth,true);
  let events=adapter.listPendingSalesOrderEventsSqlite(conn,auth,true);
  assert.deepEqual(events.map(x=>[x.eventType,x.orderVersion]),[["created",1]]);
  amend(conn,uuid(5),{operationId:uuid(107),expectedVersion:1,
    occurredAt:"2026-10-21T08:02:00.000Z",
    lines:[{...orderRequest().lines[0],quantityMilli:3000}]},auth,true);
  const confirmed=transition(conn,uuid(5),
    txn(108,"confirm",2,{occurredAt:"2026-10-21T08:03:00.000Z"}),auth,true);
  assert.equal(confirmed.order.version,3);
  transition(conn,uuid(5),txn(109,"cancel",3,
    {occurredAt:"2026-10-21T08:04:00.000Z"}),auth,true);
  events=adapter.listPendingSalesOrderEventsSqlite(conn,auth,true);
  assert.deepEqual(events.map(x=>[x.eventType,x.orderVersion]),[
    ["created",1],["amended",2],["confirmed",3],["cancelled",4]]);
  assert.equal(events[0].order.totalMinor,1000);
  assert.equal(events[1].order.totalMinor,1500);
  assert.equal(events[3].order.status,"cancelled");
  assert.equal(adapter.listPendingSalesOrderEventsSqlite(conn,{...auth,branchId:uuid(98)},true).length,0);
  assert.throws(()=>adapter.listPendingSalesOrderEventsSqlite(conn,
    {...auth,canManageSalesOrders:false},true),/permission denied/);
});
test("offline event write failure rolls back sales-order creation and amendments",()=>{
  const conn=db();
  conn.exec("DROP TABLE retail_sales_order_pending_events_v1");
  assert.throws(()=>create(conn,orderRequest(),auth,true),/no such table/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,0);
  adapter.initializeSalesOrderSqlite(conn,true);
  create(conn,orderRequest(),auth,true);
  const saved=JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true));
  conn.exec("DROP TABLE retail_sales_order_pending_events_v1");
  assert.throws(()=>amend(conn,uuid(5),{
    operationId:uuid(115),expectedVersion:1,occurredAt:"2026-10-21T08:02:00.000Z",
    lines:[{...orderRequest().lines[0],quantityMilli:4000}],
  },auth,true),/no such table/);
  assert.equal(JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true)),saved);
});
test("offline event payload corruption is rejected without acknowledging anything",()=>{
  const conn=db();create(conn,orderRequest(),auth,true);
  conn.exec("UPDATE retail_sales_order_pending_events_v1 SET version=99 WHERE org_id = ?",
    [auth.organizationId]);
  assert.throws(()=>adapter.listPendingSalesOrderEventsSqlite(conn,auth,true),
    /event identity\/revision mismatch/);
});
