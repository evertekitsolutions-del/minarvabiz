import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dbRequire = createRequire(new URL("../../../database/package.json", import.meta.url));
const ts = require("typescript");
require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), {
  fileName: f, compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { createSalesOrderSqliteReferenceVerifier } =
  require("../sales-order-reference-sqlite.ts");
const pilot = require("../sales-order-sqlite.ts");
const SQL = await dbRequire("sql.js/dist/sql-asm.js")();
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const authority = { organizationId:uuid(1), companyId:uuid(2),
  branchId:uuid(3), warehouseId:uuid(4), canManageSalesOrders:true };
const request = (patch={}) => ({
  ...authority, id:uuid(5), operationId:uuid(6), orderNumber:"SO-001",
  customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T08:00:00.000Z",
  lines:[{id:uuid(8),productId:uuid(9),description:"Notebook",
    quantityMilli:1000,unitPriceMinor:300,discountMinor:0,taxMinor:0}],
  ...patch,
});
function sqlite(){
  const raw=new SQL.Database();
  const db={
    exec(s,p=[]){raw.run(s,p);},
    query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);const rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free()}},
    transaction(fn){raw.run("BEGIN IMMEDIATE");try{const v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}},
  };
  db.exec("CREATE TABLE customers (id TEXT PRIMARY KEY, org_id TEXT, branch_id TEXT, deleted_at TEXT)");
  db.exec("CREATE TABLE products (id TEXT PRIMARY KEY, org_id TEXT, branch_id TEXT, is_active INTEGER, deleted_at TEXT)");
  db.exec("INSERT INTO customers VALUES(?,?,?,NULL)",[uuid(7),uuid(1),uuid(3)]);
  db.exec("INSERT INTO products VALUES(?,?,?,?,NULL)",[uuid(9),uuid(1),uuid(3),1]);
  pilot.initializeSalesOrderSqlite(db,true);
  const proof=(_db,scope) => {
    if(scope.organizationId!==uuid(1) || scope.companyId!==uuid(2) ||
      scope.branchId!==uuid(3) || scope.warehouseId!==uuid(4)) throw Error("Warehouse denied");
    return true;
  };
  return {db, proof};
}
test("missing warehouse proof and invalid policy fail closed",()=>{
  assert.throws(()=>createSalesOrderSqliteReferenceVerifier(),/warehouse authority/);
  assert.throws(()=>createSalesOrderSqliteReferenceVerifier(()=>true,
    {allowOrgSharedProducts:"yes"}),/shared-product policy/);
});
test("active same-branch SQLite customer, product and warehouse can create",()=>{
  const {db,proof}=sqlite();
  const verify=createSalesOrderSqliteReferenceVerifier(proof);
  assert.equal(pilot.createSalesOrderSqlite(db,request(),authority,true,verify).disposition,"new");
  assert.equal(pilot.listSalesOrdersSqlite(db,authority,true).length,1);
});
test("wrong tenant, wrong branch and deleted customer are rejected atomically",()=>{
  for(const mutation of [
    "UPDATE customers SET org_id='another-org'",
    "UPDATE customers SET branch_id='another-branch'",
    "UPDATE customers SET deleted_at='2026-10-20'",
  ]){
    const {db,proof}=sqlite();db.exec(mutation);
    assert.throws(()=>pilot.createSalesOrderSqlite(db,request(),authority,true,
      createSalesOrderSqliteReferenceVerifier(proof)),/customer not found/);
    assert.deepEqual(pilot.listSalesOrdersSqlite(db,authority,true),[]);
  }
});
test("inactive, deleted, other-tenant and other-branch product cannot be ordered",()=>{
  for(const mutation of [
    "UPDATE products SET org_id='another-org'",
    "UPDATE products SET branch_id='another-branch'",
    "UPDATE products SET deleted_at='2026-10-20'",
    "UPDATE products SET is_active=0",
  ]){
    const {db,proof}=sqlite();db.exec(mutation);
    assert.throws(()=>pilot.createSalesOrderSqlite(db,request(),authority,true,
      createSalesOrderSqliteReferenceVerifier(proof)),/product not found/);
    assert.equal(pilot.listSalesOrdersSqlite(db,authority,true).length,0);
  }
});
test("warehouse proof must explicitly return true; no truthy-object bypass",()=>{
  const {db}=sqlite();
  const verify=createSalesOrderSqliteReferenceVerifier(()=>({approved:true}));
  assert.throws(()=>pilot.createSalesOrderSqlite(db,request(),authority,true,verify),
    /warehouse authority denied/);
  assert.equal(pilot.listSalesOrdersSqlite(db,authority,true).length,0);
});
test("org-shared product is disabled by default and needs host opt-in",()=>{
  const {db,proof}=sqlite();db.exec("UPDATE products SET branch_id=NULL");
  assert.throws(()=>pilot.createSalesOrderSqlite(db,request(),authority,true,
    createSalesOrderSqliteReferenceVerifier(proof)),/product not found/);
  const verify=createSalesOrderSqliteReferenceVerifier(proof,{allowOrgSharedProducts:true});
  assert.equal(pilot.createSalesOrderSqlite(db,request(),authority,true,verify).disposition,"new");
});
test("confirmation rechecks live master references after draft creation",()=>{
  const {db,proof}=sqlite();const verify=createSalesOrderSqliteReferenceVerifier(proof);
  pilot.createSalesOrderSqlite(db,request(),authority,true,verify);
  db.exec("UPDATE products SET is_active=0 WHERE id=?",[uuid(9)]);
  const confirm={operationId:uuid(31),expectedVersion:1,action:"confirm",
    occurredAt:"2026-10-21T08:01:00.000Z"};
  assert.throws(()=>pilot.transitionSalesOrderSqlite(db,uuid(5),confirm,
    authority,true,undefined,verify),/product not found/);
  assert.equal(pilot.listSalesOrdersSqlite(db,authority,true)[0].status,"draft");
  db.exec("UPDATE products SET is_active=1 WHERE id=?",[uuid(9)]);
  assert.equal(pilot.transitionSalesOrderSqlite(db,uuid(5),confirm,
    authority,true,undefined,verify).order.status,"confirmed");
});
