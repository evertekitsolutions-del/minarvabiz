import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,file);
const {proposeReceivableAllocation:allocate}=require("../receivable-allocation.ts");
const s={tenantId:"t1",companyId:"c1",branchId:"b1",currency:"USD"};
const p={...s,paymentId:"pay1",customerId:"customer1",amountMinor:12001,idempotencyKey:"receipt-1"};
const invoice=(id,due,outstanding=5000)=>({...s,invoiceId:id,customerId:p.customerId,dueDate:due,outstandingMinor:outstanding});
test("oldest-due-first deterministic allocation with exact remainder",()=>{
 const input=[invoice("b","2026-11-02"),invoice("c","2026-11-03"),invoice("a","2026-11-02")];
 const before=JSON.stringify(input);
 const result=allocate(p,input);
 assert.deepEqual(result.allocations,[{invoiceId:"a",amountMinor:5000},{invoiceId:"b",amountMinor:5000},{invoiceId:"c",amountMinor:2001}]);
 assert.equal(result.allocatedMinor,12001);
 assert.equal(result.unappliedMinor,0);
 assert.deepEqual(allocate(p,[...input].reverse()),result);
 assert.equal(JSON.stringify(input),before);
});
test("unapplied receipt remains explicit and zero balances ignored",()=>{
 const result=allocate(p,[invoice("a","2026-11-01",1),invoice("b","2026-11-02",0)]);
 assert.deepEqual(result.allocations,[{invoiceId:"a",amountMinor:1}]);
 assert.equal(result.unappliedMinor,12000);
 assert.equal(allocate(p,[]).unappliedMinor,12001);
});
test("reject cross tenant, company, branch, currency and customer",()=>{
 for(const field of ["tenantId","companyId","branchId","currency","customerId"]){
   assert.throws(()=>allocate(p,[{...invoice("a","2026-11-01"),[field]:"other"}]),/scope|currency|customer/i);
 }
});
test("reject duplicates, invalid dates, amounts and IDs",()=>{
 const a=invoice("a","2026-11-01");
 assert.throws(()=>allocate(p,[a,a]),/Duplicate/);
 assert.throws(()=>allocate(p,[{...a,dueDate:"2026-02-30"}]),/date/);
 assert.throws(()=>allocate(p,[{...a,outstandingMinor:0.5}]),/minor units/);
 assert.throws(()=>allocate({...p,amountMinor:0},[a]),/minor units/);
 assert.throws(()=>allocate({...p,amountMinor:Number.MAX_SAFE_INTEGER+1},[a]),/minor units/);
 assert.throws(()=>allocate({...p,idempotencyKey:""},[a]),/idempotency/);
 assert.throws(()=>allocate(p,[{...a,invoiceId:"__proto__"}]),/Invalid|Duplicate/);
});
test("same receipt proposal is stable but does not claim persisted idempotency",()=>{
 const rows=[invoice("a","2026-11-01")];
 assert.deepEqual(allocate(p,rows),allocate(p,rows));
 assert.equal(allocate(p,rows).idempotencyKey,p.idempotencyKey);
});
