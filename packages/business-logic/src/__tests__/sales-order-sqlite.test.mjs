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
  const conn=db();const first=adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true);
  assert.equal(first.disposition,"new");
  assert.equal(adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true).disposition,"replay");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,1);
  assert.equal(adapter.listSalesOrdersSqlite(conn,{...auth,branchId:uuid(80)},true).length,0);
  assert.throws(()=>adapter.createSalesOrderSqlite(conn,orderRequest({id:uuid(10),operationId:uuid(11)}),auth,true),/number already exists/);
  assert.throws(()=>adapter.createSalesOrderSqlite(conn,orderRequest({branchId:uuid(55)}),auth,true),/scope mismatch/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true).length,1);
});
test("version compare-and-set and exact replay preserve one stored order",()=>{
  const conn=db();adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true);
  const next=adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(11,"confirm",1),auth,true);
  assert.equal(next.order.version,2);
  assert.equal(next.order.status,"confirmed");
  assert.equal(adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(11,"confirm",1),auth,true).disposition,"replay");
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(12,"cancel",1),auth,true),/Stale/);
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].version,2);
  const cancelled=adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(12,"cancel",2),auth,true);
  assert.equal(cancelled.order.status,"cancelled");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].version,3);
});
test("SQL transaction rollback on invalid input, corrupt rows and unauthorized role",()=>{
  const conn=db();adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true);
  const before=JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true));
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(11,"confirm",1),
    {...auth,canManageSalesOrders:false},true),/permission denied/);
  assert.throws(()=>adapter.createSalesOrderSqlite(conn,orderRequest({operationId:uuid(20),
    id:uuid(22),lines:[{...orderRequest().lines[0],quantityMilli:0}]}),auth,true),/positive/);
  assert.equal(JSON.stringify(adapter.listSalesOrdersSqlite(conn,auth,true)),before);
  conn.exec("UPDATE retail_sales_order_intents_v1 SET version = 5 WHERE id = ?",[uuid(5)]);
  assert.throws(()=>adapter.listSalesOrdersSqlite(conn,auth,true),/identity or revision mismatch/);
});
test("committed invoice link is only accepted from matching recorded identity",()=>{
  const conn=db();adapter.createSalesOrderSqlite(conn,orderRequest(),auth,true);
  adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(11,"confirm",1),auth,true);
  const sale={id:uuid(60),organizationId:auth.organizationId,companyId:auth.companyId,
    branchId:auth.branchId,customerId:uuid(7),currency:"INR",totalMinor:1000};
  assert.throws(()=>adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:{...sale,branchId:uuid(20)}}),auth,true),/does not match/);
  const result=adapter.transitionSalesOrderSqlite(conn,uuid(5),txn(12,"link-invoice",2,
    {committedInvoice:sale}),auth,true);
  assert.equal(result.order.invoiceId,uuid(60));
  assert.equal(result.order.status,"invoiced");
  assert.equal(adapter.listSalesOrdersSqlite(conn,auth,true)[0].status,"invoiced");
});
