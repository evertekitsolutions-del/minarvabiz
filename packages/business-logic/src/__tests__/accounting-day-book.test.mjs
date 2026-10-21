import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
   fileName:file,
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,file);
const {calculateAccountingDayBook,buildAuthorizedAccountingDayBook}=require("../accounting-day-book.ts");
const {setCurrentRole}=require("../permissions.ts");
const accounting=require("../accounting-store.ts");
const line=(accountId,debit,credit)=>({accountId,accountName:accountId,
 accountCode:accountId,debit,credit});
function journal(id,date,amount,patch={}){
 return {
  id,journalNumber:"J-"+id,entryDate:date,description:id,status:"posted",
  totalDebit:amount,totalCredit:amount,
  lines:[line("cash",amount,0),line("income",0,amount)],
  createdAt:date+"T10:00:00Z",updatedAt:date+"T10:00:00Z",
  ...patch,
 };
}
test("day-book includes posted and void events and their reversals, never drafts",()=>{
 const a=journal("old","2026-10-20",118,{status:"void"});
 const b=journal("reverse","2026-10-20",118,{
  lines:[line("income",118,0),line("cash",0,118)],
 });
 const c=journal("new","2026-10-21",25);
 const draft=journal("draft","2026-10-21",900,{status:"draft"});
 const r=calculateAccountingDayBook([a,b,c,draft],"2026-10-20","2026-10-21");
 assert.equal(r.journalCount,3);
 assert.equal(r.totalDebit,261);
 assert.equal(r.totalCredit,261);
 assert.equal(r.daily.length,2);
 assert.equal(r.daily.find(x=>x.date==="2026-10-20").journalCount,2);
 assert.match(r.journals.find(x=>x.journalEntryId==="new").accountBreakdown,/cash Dr 25.00/);
 assert.equal(r.journals.find(x=>x.journalEntryId==="old").status,"void");
 assert.equal(calculateAccountingDayBook([a,b,c],"2026-10-21","2026-10-21").journalCount,1);
});
test("input validation rejects invalid date, line totals and nonbalanced ledgers",()=>{
 const entry=journal("one","2026-10-21",100);
 assert.throws(()=>calculateAccountingDayBook([entry],"2026-02-30"),/Invalid/);
 assert.throws(()=>calculateAccountingDayBook([entry],"2026-11-01","2026-10-01"),/exceeds/);
 assert.throws(()=>calculateAccountingDayBook([{...entry,totalCredit:90}]),/not balanced/);
 assert.throws(()=>calculateAccountingDayBook([{
  ...entry,lines:[line("cash",100,0),line("income",0,90)],
 }]),/not balanced/);
 assert.throws(()=>calculateAccountingDayBook([{
  ...entry,lines:[line("cash",100,1),line("income",0,101)],
 }]),/Invalid posted/);
 assert.deepEqual(calculateAccountingDayBook([],undefined,undefined).journals,[]);
});
test("accounting.view is enforced and foreign branch journals excluded",()=>{
 const before=accounting.exportAccountingState();
 try{
  accounting.hydrateAccountingState({journals:[journal("good","2026-10-21",75)]});
  setCurrentRole("staff");
  assert.throws(()=>buildAuthorizedAccountingDayBook(),/Permission denied/);
  setCurrentRole("manager");
  assert.equal(buildAuthorizedAccountingDayBook().journalCount,1);
  accounting.hydrateAccountingState({journals:[journal("foreign","2026-10-21",75,{branchId:"foreign"})]});
  assert.equal(buildAuthorizedAccountingDayBook().journalCount,0);
 }finally{
  setCurrentRole(null);
  accounting.hydrateAccountingState(before);
 }
});
test("shared report shows Day Book with safeguarded exports",()=>{
 const p=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(p,/day-book/);
 assert.match(p,/buildAuthorizedAccountingDayBook/);
 assert.match(p,/can\("accounting.view"\)/);
 assert.match(p,/Day Book/);
});
