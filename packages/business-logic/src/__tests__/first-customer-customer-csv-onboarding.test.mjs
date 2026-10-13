import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename,"utf8"),{fileName:filename,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
  }}
).outputText,filename);
const csv=require("../csv-import.ts");
const store=require("../store.ts");
const perms=require("../permissions.ts");
const outbox=require("../outbox-bridge.ts");
perms.setCurrentRole("admin");perms.setRuntimeFeaturePolicy(null);
const reset=()=>{store.hydrateCore({customers:[],products:[],categories:[],sales:[],payments:[]});outbox.hydrateOutbox([])};
const state=()=>JSON.stringify({customers:store.listCustomers(),outbox:outbox.exportOutbox()});

test("customer CSV parses BOM, quoted commas and embedded newlines",()=>{
  reset();
  const result=csv.parseCustomerCsv('\uFEFFname,phone,email,address,notes\r\n"Joe, Jr",+91 98765 43210,joe@example.com,"Street, Kerala","Long\r\nnote"');
  assert.deepEqual(result.errors,[]);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].name,"Joe, Jr");
  assert.equal(result.rows[0].notes,"Long\nnote");
  assert.equal(result.rows[0].phone,"+91 98765 43210");
});
test("reject malformed customer CSV header and row widths before mutation",()=>{
  reset();
  for(const input of [
    "name,phone,PHONE\nA,1234567890,1234567890",
    "name,secret\nA,B",
    "phone,email\n1234567890,valid@example.com",
    "name,phone\nA,1234567890,extra",
    'name,phone\n"A,1234567890',
    "name,phone\nA",
  ]){
    const before=state();
    assert.ok(csv.parseCustomerCsv(input).errors.length,input);
    const result=csv.importCustomersFromCsv(input);
    assert.equal(result.created,0);
    assert.deepEqual(state(),before);
  }
});
test("reject bad phone and email values, overly long names and injection before writing",()=>{
  reset();
  for(const input of [
    "name,phone,email\nA,1234,a@example.com",
    "name,phone,email\nA,ab1234567,a@example.com",
    "name,phone,email\nA,1234567890,not-an-email",
    "name,phone,email\n,1234567890,a@example.com",
    "name,phone,email\n"+"A".repeat(501)+",1234567890,a@example.com",
    "name,notes\nA,"+"n".repeat(2001),
  ]){
    const before=state();
    assert.ok(csv.parseCustomerCsv(input).errors.length,input.slice(0,80));
    assert.equal(csv.importCustomersFromCsv(input).created,0);
    assert.equal(state(),before);
  }
});
test("normalised phone and email duplicates within one file and existing customers fail closed",()=>{
  reset();
  for(const source of [
    "name,phone\nA,+91 98765 43210\nB,919876543210",
    "name,email\nA,EXAMPLE@MAIL.COM\nB,example@mail.com",
  ]){
    assert.equal(csv.importCustomersFromCsv(source).created,0);
    assert.equal(store.listCustomers().length,0);
  }
  store.createCustomer({name:"Existing",phone:"+91 99887 76655",email:"OLD@EXAMPLE.COM"});
  const before=state();
  for(const source of [
    "name,phone\nDuplicate,919988776655",
    "name,email\nDuplicate,old@example.com",
    "name,phone\nNew,9876543210\nDuplicate,919988776655",
  ]){
    const result=csv.importCustomersFromCsv(source);
    assert.equal(result.created,0);
    assert.ok(result.errors.some(e=>/already exists|duplicate/i.test(e)));
    assert.equal(state(),before);
  }
});
test("preview never writes, confirmed import creates all customers and one outbox item per customer",()=>{
  reset();
  const src="name,phone,email,address,notes\nCustomer A,1234567890,a@example.com,Street A,VIP\nCustomer B,19876543210,b@example.com,Street B,Important";
  const before=state();
  const p=csv.parseCustomerCsv(src);
  assert.deepEqual(p.errors,[]);
  assert.equal(p.rows.length,2);
  assert.equal(state(),before,"preview must never mutate local records");
  const result=csv.importCustomersFromCsv(src);
  assert.deepEqual(result,{created:2,errors:[]});
  assert.equal(store.listCustomers().length,2);
  const events=outbox.exportOutbox().filter(e=>e.aggregateType==="customers");
  assert.equal(events.length,2);
  for(const event of events)assert.equal(event.status,"pending");
  assert.equal(store.listCustomers().every(c=>c.outstandingBalance===0&&c.totalSpending===0),true);
  const duplicate=csv.importCustomersFromCsv(src);
  assert.equal(duplicate.created,0);
  assert.equal(store.listCustomers().length,2);
});
test("exported customer CSV escapes formulas and quotes without leaking financial balances",()=>{
  reset();
  store.createCustomer({name:'=HYPERLINK("url")',phone:"+919876543210",notes:"+CMD\nnotes"});
  const exported=csv.exportCustomersCsv();
  assert.match(exported,/'=HYPERLINK/);
  assert.match(exported,/"?'\+CMD/);
  assert.ok(!exported.includes("outstandingBalance"));
  assert.ok(!exported.includes("totalSpending"));
  assert.doesNotMatch(exported,/\x27\+919876543210/, "international phone must remain export/import compatible");
  assert.match(exported,/name,phone,email,address,notes/);
});
test("customer CSV import enforces customer role permissions even when all rows validate",()=>{
  reset();
  perms.setCurrentRole("staff");
  const before=state();
  try{
    const result=csv.importCustomersFromCsv("name,phone\nA,1234567890");
    assert.equal(result.created,0);
    assert.ok(result.errors.length);
    assert.equal(state(),before);
  }finally{perms.setCurrentRole("admin")}
});
test("customers screen offers preview, template, export and confirm with rejected-error gate",()=>{
  const ui=fs.readFileSync("apps/web/src/app/(app)/customers/page.tsx","utf8");
  for(const key of ["parseCustomerCsv","importCustomersFromCsv","exportCustomersCsv","Preview customer CSV","Confirm customer import","Download customer CSV template","accept=\".csv,text/csv\""])assert.ok(ui.includes(key),key);
  assert.match(ui,/csvPreview\.errors\.length/);
});
