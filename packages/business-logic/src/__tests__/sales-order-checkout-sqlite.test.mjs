import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sqliteRequire = createRequire(new URL("../../../database/package.json", import.meta.url));
const ts = require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(ts.transpileModule(
  fs.readFileSync(path,"utf8"), {fileName:path,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},).outputText,path);
const SQL = await sqliteRequire("sql.js/dist/sql-asm.js")();
const api = require("../sales-order-sqlite.ts");
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth = {organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
  warehouseId:uuid(4),canManageSalesOrders:true};
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),
  orderNumber:"SO-INV-001",customerId:uuid(7),currency:"INR",
  createdAt:"2026-10-21T06:00:00.000Z",lines:[
    {id:uuid(8),productId:uuid(9),description:"Paper",
      quantityMilli:2000,unitPriceMinor:500,discountMinor:0,taxMinor:0},
  ]});
const checkoutReq={operationId:uuid(10),expectedVersion:2,
  occurredAt:"2026-10-21T06:03:00.000Z"};
function database(){
  const raw=new SQL.Database();
  const db={exec(sql,params=[]){raw.run(sql,params);},
    query(sql,params=[]){const s=raw.prepare(sql);try{s.bind(params);let rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free();}},
    transaction(fn){raw.run("BEGIN IMMEDIATE");try{const x=fn();raw.run("COMMIT");return x;}catch(e){raw.run("ROLLBACK");throw e;}},
  };
  api.initializeSalesOrderSqlite(db,true);
  db.exec(`CREATE TABLE committed_invoice_pilot (
    operation_id TEXT PRIMARY KEY, id TEXT NOT NULL, org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,branch_id TEXT NOT NULL,customer_id TEXT NOT NULL,
    currency TEXT NOT NULL,total_minor INTEGER NOT NULL)`);
  db.exec("CREATE TABLE stock_debits_pilot (operation_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, qty_milli INTEGER NOT NULL)");
  db.exec("CREATE TABLE journal_pilot (operation_id TEXT PRIMARY KEY, total_minor INTEGER NOT NULL)");
  api.createSalesOrderSqlite(db,request(),auth,true,()=>true);
  api.transitionSalesOrderSqlite(db,uuid(5),{operationId:uuid(11),expectedVersion:1,
    occurredAt:"2026-10-21T06:02:00.000Z",action:"confirm"},
    auth,true,undefined,()=>true);
  return db;
}
function host(overrides={}){
  return {
    commitFinancialSale(db,order,op){
      db.exec("INSERT INTO committed_invoice_pilot VALUES (?,?,?,?,?,?,?,?)",
        [op,uuid(30),order.organizationId,order.companyId,order.branchId,
          order.customerId,order.currency,order.totalMinor]);
      db.exec("INSERT INTO stock_debits_pilot VALUES (?,?,?)",
        [op,order.lines[0].productId,order.lines[0].quantityMilli]);
      db.exec("INSERT INTO journal_pilot VALUES (?,?)",[op,order.totalMinor]);
    },
    readCommittedInvoice(db,op){
      const x=db.query("SELECT * FROM committed_invoice_pilot WHERE operation_id=?",[op])[0];
      return x?{id:String(x.id),organizationId:String(x.org_id),
        companyId:String(x.company_id),branchId:String(x.branch_id),
        customerId:String(x.customer_id),currency:String(x.currency),
        totalMinor:Number(x.total_minor)}:null;
    },...overrides,
  };
}
const count=(db,table)=>db.query(`SELECT count(*) AS n FROM ${table}`)[0].n;
test("confirmed order checkout creates exactly one invoice, stock debit and journal",()=>{
  const db=database(),writer=host();
  const first=api.checkoutSalesOrderSqlite(db,uuid(5),checkoutReq,auth,true,writer);
  assert.equal(first.disposition,"update");
  assert.equal(first.order.status,"invoiced");
  assert.equal(first.order.invoiceId,uuid(30));
  assert.equal(first.order.version,3);
  assert.equal(count(db,"committed_invoice_pilot"),1);
  assert.equal(count(db,"stock_debits_pilot"),1);
  assert.equal(count(db,"journal_pilot"),1);
  assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,3);
  const repeat=api.checkoutSalesOrderSqlite(db,uuid(5),checkoutReq,auth,true,writer);
  assert.equal(repeat.disposition,"replay");
  assert.equal(count(db,"stock_debits_pilot"),1);
  assert.equal(count(db,"journal_pilot"),1);
  assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,3);
});
test("malformed CAS, no trusted writer and wrong scope do not write money",()=>{
  const db=database(),writer=host();
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),checkoutReq,auth,true),
    /Trusted transactional financial writer/);
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),
    {...checkoutReq,expectedVersion:1},auth,true,writer),/Stale/);
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),checkoutReq,
    {...auth,branchId:uuid(90)},true,writer),/scope mismatch/);
  assert.equal(count(db,"committed_invoice_pilot"),0);
  assert.equal(api.listSalesOrdersSqlite(db,auth,true)[0].status,"confirmed");
});
test("invalid receipt rolls back invoice, stock and journal together",()=>{
  const db=database();
  const falseReceipt=host({readCommittedInvoice(_,key){
    return {id:uuid(30),organizationId:uuid(90),companyId:auth.companyId,
      branchId:auth.branchId,customerId:uuid(7),currency:"INR",totalMinor:1000};
  }});
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),checkoutReq,
    auth,true,falseReceipt),/does not match/);
  for (const table of ["committed_invoice_pilot","stock_debits_pilot","journal_pilot"])
    assert.equal(count(db,table),0);
  assert.equal(api.listSalesOrdersSqlite(db,auth,true)[0].status,"confirmed");
  assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
});
test("financial writer failing after stock/journal mutation rolls back all",()=>{
  const db=database();
  const writer=host({commitFinancialSale(db,order,op){
    db.exec("INSERT INTO stock_debits_pilot VALUES (?,?,?)",
      [op,order.lines[0].productId,order.lines[0].quantityMilli]);
    db.exec("INSERT INTO journal_pilot VALUES (?,?)",[op,order.totalMinor]);
    throw Error("stock ledger rejected checkout");
  }});
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),
    checkoutReq,auth,true,writer),/stock ledger rejected checkout/);
  assert.equal(count(db,"stock_debits_pilot"),0);
  assert.equal(count(db,"journal_pilot"),0);
  assert.equal(api.listSalesOrdersSqlite(db,auth,true)[0].version,2);
});
test("financial writer Promise is rejected and cannot acknowledge later",()=>{
  const db=database();
  const writer=host({commitFinancialSale(){return Promise.resolve()}});
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),
    checkoutReq,auth,true,writer),/must be synchronous/);
  assert.equal(api.listSalesOrdersSqlite(db,auth,true)[0].status,"confirmed");
  assert.equal(count(db,"committed_invoice_pilot"),0);
});
test("missing receipt always blocks paid checkout and rolls back",()=>{
  const db=database();
  const writer=host({readCommittedInvoice(){return null}});
  assert.throws(()=>api.checkoutSalesOrderSqlite(db,uuid(5),
    checkoutReq,auth,true,writer),/No authoritative committed invoice/);
  assert.equal(count(db,"committed_invoice_pilot"),0);
});
