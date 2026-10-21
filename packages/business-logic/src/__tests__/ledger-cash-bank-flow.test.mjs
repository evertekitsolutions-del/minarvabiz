import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
 fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,file);
const {calculatePostedCashBankFlow,buildAuthorizedCashBankFlow}=require("../ledger-cash-bank-flow.ts");
const {setCurrentRole}=require("../permissions.ts");
const accounting=require("../accounting-store.ts");
const accts=[
 {id:"cash-1",name:"Cash",systemKey:"cash",type:"asset"},
 {id:"bank-1",name:"Bank",systemKey:"bank",type:"asset"},
 {id:"income",name:"Sales",systemKey:"sales",type:"income"},
 {id:"expense",name:"Expense",systemKey:"expense",type:"expense"},
 {id:"equity",name:"Equity",systemKey:"owner_equity",type:"equity"},
];
const make=(id,date,lines,status="posted",patch={})=>{
 const items=lines.map(([accountId,debit,credit])=>({accountId,debit,credit}));
 const deb=items.reduce((s,x)=>s+x.debit,0);
 const cre=items.reduce((s,x)=>s+x.credit,0);
 return {
 id,journalNumber:"J-"+id,entryDate:date,description:id,status,
 createdAt:date+"T10:00:00Z",updatedAt:date+"T10:00:00Z",
 totalDebit:deb,totalCredit:cre,lines:items,...patch,
 };
};
const events=[
 make("opening","2026-01-01",[
  ["cash-1",500,0],["equity",0,500],
 ]),
 make("sale","2026-10-10",[
  ["bank-1",118,0],["income",0,118],
 ]),
 make("expense","2026-10-11",[
  ["expense",30,0],["cash-1",0,30],
 ]),
 make("transfer","2026-10-12",[
  ["bank-1",200,0],["cash-1",0,200],
 ]),
 make("draft","2026-10-13",[
  ["bank-1",999,0],["income",0,999],
 ],"draft"),
];
test("posted cash+bank movement tracks exact openings and flows without double-counting transfer",()=>{
 const data=calculatePostedCashBankFlow(accts,events,"2026-10-01","2026-10-31");
 assert.equal(data.openingTotal,500);
 assert.equal(data.openingCash,500);
 assert.equal(data.cashInflows,118);
 assert.equal(data.cashOutflows,30);
 assert.equal(data.netFlow,88);
 assert.equal(data.closingCash,270);
 assert.equal(data.closingBank,318);
 assert.equal(data.closingTotal,588);
 assert.equal(data.movements.length,3);
 assert.equal(data.movements.find(x=>x.journalEntryId==="transfer").netCashFlow,0);
 assert.equal(data.closingTotal,data.openingTotal+data.netFlow);
});
test("voided original and reversal journal cancel for the consolidated movement",()=>{
 const original=make("voided","2026-10-20",[
  ["cash-1",75,0],["income",0,75],
 ],"void");
 const reversal=make("reversal","2026-10-20",[
  ["income",75,0],["cash-1",0,75],
 ]);
 const r=calculatePostedCashBankFlow(accts,[original,reversal],"2026-10-01","2026-10-31");
 assert.equal(r.netFlow,0);
 assert.equal(r.cashInflows,75);
 assert.equal(r.cashOutflows,75);
});
test("invalid dates and nonbalanced or tampered posted journals fail closed",()=>{
 for(const from of ["2026-02-30","nonsense"]){
  assert.throws(()=>calculatePostedCashBankFlow(accts,events,from),/Invalid/);
 }
 assert.throws(()=>calculatePostedCashBankFlow(accts,events,"2026-11-01","2026-10-01"),/exceeds/);
 const corrupt=make("bad","2026-10-20",[
  ["cash-1",100,0],["equity",0,90],
 ]);
 assert.throws(()=>calculatePostedCashBankFlow(accts,[corrupt]),/not balanced/);
});
test("cash/bank flow role gate denies non-accounting roles and branch scoping",()=>{
 const previous=accounting.exportAccountingState();
 try{
  accounting.hydrateAccountingState({accounts:accts.map((a)=>({
    ...a,code:"999"+a.id,normalBalance:"debit",isActive:true,
    createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1,
  })),journals:events});
  setCurrentRole("cashier");
  assert.throws(()=>buildAuthorizedCashBankFlow("2026-10-01"),/Permission denied/);
  setCurrentRole("manager");
  assert.equal(buildAuthorizedCashBankFlow("2026-10-01").netFlow,88);
  accounting.hydrateAccountingState({accounts:accts.map(a=>({
    ...a,branchId:"foreign",code:"999"+a.id,normalBalance:"debit",isActive:true,
    createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1,
  })),journals:events.map(e=>({...e,branchId:"foreign"}))});
  assert.equal(buildAuthorizedCashBankFlow("2026-10-01").netFlow,0);
 }finally{
  setCurrentRole(null);
  accounting.hydrateAccountingState(previous);
 }
});
test("reports UI offers restricted cash-bank flow tab and export",()=>{
 const src=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(src,/cash-bank-flow/);
 assert.match(src,/buildAuthorizedCashBankFlow/);
 assert.match(src,/mayReadCashFlow = can\("accounting.view"\)/);
});
