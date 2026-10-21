import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {buildAccountBudgetVariance}=require("../account-budget-variance.ts");
const income={id:"income",code:"4100",name:"Service revenue",type:"income",branchId:"b1"};
const expense={id:"expense",code:"5100",name:"Electricity",type:"expense",branchId:"b1"};
const budget={accountId:"expense",periodFrom:"2026-01-01",periodTo:"2026-01-31",budgetAmount:"100.00"};
const journal=(id,date,status,accountId,debit,credit,patch={})=>({
  id,entryDate:date,status,branchId:"b1",
  lines:[{id:id+"-1",accountId,debit,credit}],...patch,
});
const report=(input={},records=[],accountList=[income,expense],branch="b1")=>
  buildAccountBudgetVariance({...budget,...input},accountList,records,branch);

test("expense budget variance counts only scoped posted ledger and reversals",()=>{
  const rows=[
    journal("a","2026-01-02","posted","expense",80,0),
    journal("b","2026-01-30","posted","expense",20,0),
    journal("c","2026-01-30","void","expense",10,0),
    journal("d","2026-01-31","posted","expense",0,10),
    journal("e","2026-02-01","posted","expense",900,0),
    journal("f","2026-01-04","draft","expense",900,0),
    journal("g","2026-01-04","posted","income",0,900),
    journal("h","2026-01-04","posted","expense",900,0,{branchId:"b2"}),
  ];
  const original=JSON.stringify(rows);
  const result=report({},rows);
  assert.equal(result.actual,100);
  assert.equal(result.variance,0);
  assert.equal(result.favorable,true);
  assert.equal(result.utilizationPercent,100);
  assert.equal(result.matchedJournalCount,4);
  assert.equal(JSON.stringify(rows),original);
});

test("income budget reverses debit/credit orientation and reports favorable overperformance",()=>{
  const p=report({accountId:"income",budgetAmount:"90.00"},[
    journal("one","2026-01-02","posted","income",0,100),
    journal("two","2026-01-30","posted","income",2,0),
  ]);
  assert.deepEqual([p.actual,p.budget,p.variance,p.favorable],[98,90,8,true]);
  assert.equal(p.utilizationPercent,108.9);
});

test("budget zero does not invent utilization, negative net actual remains meaningful",()=>{
  const p=report({budgetAmount:"0"},[
    journal("x","2026-01-02","posted","expense",0,30),
  ]);
  assert.equal(p.actual,-30);
  assert.equal(p.utilizationPercent,null);
  assert.equal(p.favorable,true);
});

test("fail closed for unauthorized, deleted or non-PL account, duplicate journals and invalid money",()=>{
  assert.throws(()=>report({},[],[{...expense,branchId:"b2"}]),/authorized/);
  assert.throws(()=>report({},[],[{...expense,deletedAt:"2026-01-01"}]),/authorized/);
  assert.throws(()=>report({},[],[{...expense,type:"asset"}]),/authorized/);
  const same=journal("dupe","2026-01-01","posted","expense",1,0);
  assert.throws(()=>report({},[same,same]),/Duplicate/);
  for(const amount of ["","-1","1.001","1e4","1,000.00","Infinity","9007199254740993.00"]){
    assert.throws(()=>report({budgetAmount:amount}),/Budget/);
  }
  assert.throws(()=>report({},[journal("bad","2026-01-01","posted","expense",0.001,0)]),/Posted debit/);
  assert.throws(()=>report({},[journal("bad","2026-01-01","posted","expense",Infinity,0)]),/Posted debit/);
});

test("invalid range fails, CSV is quoted and formula-safe",()=>{
  for (const date of ["2026-02-30","2026-13-01","2026/01/01","1999-01-01"]){
    assert.throws(()=>report({periodTo:date}),/date/);
  }
  assert.throws(()=>report({periodFrom:"2027-01-01"}),/range/);
  const p=report({},[],[income,{...expense,name:"=Power(1,2)"}]);
  assert.match(p.csv,/"'=Power\(1,2\)"/);
  assert.equal(p.csv.split("\r\n").length,3);
});

test("Accounting UI includes manual read-only budget comparison",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountBudgetVariancePanel.tsx",import.meta.url),"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountingPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/Compare budget/);
  assert.match(ui,/Export budget variance CSV/);
  assert.match(ui,/buildAccountBudgetVariance/);
  assert.match(host,/tabButton\("budgets", "Budgets"\)/);
  assert.match(host,/<AccountBudgetVariancePanel \/>/);
});
