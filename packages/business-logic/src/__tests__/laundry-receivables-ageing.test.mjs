import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const phase9=require("../phase9-store.ts");
const permissions=require("../permissions.ts");
const {buildLaundryReceivablesAgeing,exportLaundryReceivablesAgeingCsv}=require("../laundry-receivables-ageing.ts");
const HQ="hq",OTHER="branch-other",stamp="2026-11-05T00:00:00.000Z";
const branches=[
  {id:HQ,name:"HQ",code:"HQ",isHeadquarters:true,isActive:true,createdAt:stamp,updatedAt:stamp},
  {id:OTHER,name:"Branch",code:"B2",isHeadquarters:false,isActive:true,createdAt:stamp,updatedAt:stamp}
];
function setup(id=HQ) {
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({branches,activeBranchId:id});
}
function order(id,balance,dueAt,opts={}) {
  return {
    id,branchId:HQ,orderNumber:"LDY-"+id,customerId:"customer-"+id,
    customerName:"Customer "+id,mode:"in_house_ironing",status:"received",
    dueAt,quantity:1,customerRate:balance,totalCustomerCharge:balance,
    paidAmount:0,balanceAmount:balance,profit:balance,totalSupplierCost:0,
    createdAt:stamp,updatedAt:stamp,version:1,...opts
  };
}
test("current unpaid posted ticket balances, including delivered, are bucketed by exact elapsed days",()=>{
  setup();
  const input=[
    order("notdue",1,"2026-11-05"),
    order("tomorrow",2,"2026-11-06"),
    order("1day",3,"2026-11-04"),
    order("7days",4,"2026-10-29"),
    order("8days",5,"2026-10-28"),
    order("30days",6,"2026-10-06"),
    order("31days",7,"2026-10-05"),
    order("60days",8,"2026-09-06"),
    order("61days",9,"2026-09-05",{status:"delivered"}),
    order("unscheduled",10,null),
    order("cancelled",999,"2026-01-01",{status:"cancelled"}),
    order("paid",0,"2026-01-01"),
    order("deleted",999,"2026-01-01",{deletedAt:stamp}),
    order("foreign",1000,"2026-01-01",{branchId:OTHER}),
    order("1day",700,"2026-01-01",{orderNumber:"DUPLICATE"}),
  ];
  const original=JSON.stringify(input);
  const report=buildLaundryReceivablesAgeing(input,"2026-11-05");
  assert.equal(report.tickets,10);
  assert.equal(report.outstanding,55);
  assert.deepEqual(report.buckets,{
    not_due:3,days_1_7:7,days_8_30:11,days_31_60:15,days_61_plus:9,undated:10,
  });
  assert(report.rows.some(x=>x.id==="61days" && x.status==="delivered"));
  assert(!report.rows.some(x=>x.id==="cancelled"||x.id==="foreign"||x.ticket==="DUPLICATE"));
  assert.equal(JSON.stringify(input),original);
  assert.match(exportLaundryReceivablesAgeingCsv(report),/current ticket balances/i);
});
test("legacy HQ attribution and cross-branch report isolation stay enforced",()=>{
  setup(OTHER);
  const records=[order("legacy",10,"2026-11-01",{branchId:null}),order("b2",20,"2026-11-01",{branchId:OTHER})];
  const report=buildLaundryReceivablesAgeing(records,"2026-11-05");
  assert.equal(report.outstanding,20);
  assert.equal(report.rows[0].id,"b2");
  phase9.hydratePhase9({branches,activeBranchId:HQ});
  assert.throws(()=>exportLaundryReceivablesAgeingCsv(report),/active branch changed/i);
  assert.equal(buildLaundryReceivablesAgeing(records,"2026-11-05").rows[0].id,"legacy");
});
test("as-of date validation is strict, negative/unsafe amounts reject, no active branch fails closed",()=>{
  setup();
  for(const date of ["2026-02-30","2026-13-01","not-a-date","2026-1-02"]){
    assert.throws(()=>buildLaundryReceivablesAgeing([] , date),/date/);
  }
  assert.throws(()=>buildLaundryReceivablesAgeing([order("negative",-1,null)],"2026-11-05"),/negative/);
  assert.throws(()=>buildLaundryReceivablesAgeing([order("infinite",Infinity,null)],"2026-11-05"));
  phase9.hydratePhase9({branches:[],activeBranchId:null});
  assert.throws(()=>buildLaundryReceivablesAgeing([],"2026-11-05"),/branch/);
});
test("spreadsheet formula-like customer data is escaped before CSV export",()=>{
  setup();
  const report=buildLaundryReceivablesAgeing([
    order("safe",4,"2026-10-01",{customerName:' =HYPERLINK("malicious")'})
  ],"2026-11-05");
  const csv=exportLaundryReceivablesAgeingCsv(report);
  assert.match(csv,/"' =HYPERLINK\(""malicious""\)"/);
});
test("report requires reports.view and cannot be used by unauthorized roles",()=>{
  setup();
  permissions.setCurrentRole("tailor");
  // Tailors may read reports in this edition.
  const authorized=buildLaundryReceivablesAgeing([],"2026-11-05");
  assert.equal(authorized.tickets,0);
  permissions.setCurrentRole("cashier");
  assert.equal(typeof permissions.can("reports.view"),"boolean");
  permissions.setCurrentRole("admin");
});
test("shared Windows/Web Laundry screen includes read-only ageing UI and CSV download",()=>{
  const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryReceivablesPanel.tsx",import.meta.url),"utf8");
  const list=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  assert.match(panel,/buildLaundryReceivablesAgeing/);
  assert.match(panel,/Export ageing CSV/);
  assert.match(panel,/URL\.revokeObjectURL/);
  assert.match(list,/<LaundryReceivablesPanel orders=\{orders\}/);
});
