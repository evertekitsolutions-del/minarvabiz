import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {buildLoanRepaymentPlan}=require("../loan-repayment-plan.ts");
const base={
  loanReference:"LN-2026-01",principal:"12000.00",annualRatePercent:"12.0000",
  termMonths:12,firstPaymentDate:"2026-01-31",
};
const run=change=>buildLoanRepaymentPlan({...base,...change});

test("12-month nominal fixed-rate EMI schedule reconciles principal and paid interest",()=>{
  const original=JSON.stringify(base),plan=run({});
  assert.equal(plan.termMonths,12);
  assert.equal(plan.periods.length,12);
  assert.deepEqual(plan.periods.slice(0,3).map(p=>p.paymentDate),
    ["2026-01-31","2026-02-28","2026-03-31"]);
  assert.equal(plan.periods[0].interestPaid,120);
  assert.equal(plan.periods.at(-1).closingPrincipal,0);
  assert.equal(Math.round(plan.periods.reduce((a,p)=>a+p.principalPaid,0)*100),1200000);
  assert.equal(Math.round(plan.periods.reduce((a,p)=>a+p.interestPaid,0)*100),Math.round(plan.totalInterest*100));
  assert.equal(Math.round(plan.totalPayments*100),Math.round((plan.principal+plan.totalInterest)*100));
  assert.equal(JSON.stringify(base),original);
});

test("zero-interest amortization divides cents without unreconciled residual",()=>{
  const p=run({principal:"100.00",annualRatePercent:"0",termMonths:3});
  assert.equal(p.plannedMonthlyPayment,33.33);
  assert.deepEqual(p.periods.map(x=>x.payment),[33.33,33.33,33.34]);
  assert.deepEqual(p.periods.map(x=>x.interestPaid),[0,0,0]);
  assert.equal(p.totalPayments,100);
  assert.equal(p.periods.at(-1).closingPrincipal,0);
});

test("leap-day monthly anchor and final installment are deterministic",()=>{
  const change={firstPaymentDate:"2024-02-29",termMonths:13};
  const a=run(change),b=run(change);
  assert.deepEqual(a,b);
  assert.equal(a.periods[11].paymentDate,"2025-01-29");
  assert.equal(a.periods[12].paymentDate,"2025-02-28");
  assert.equal(a.periods.at(-1).closingPrincipal,0);
});

test("high rate and one-month term charge interest once and close principal",()=>{
  const p=run({principal:"10.00",annualRatePercent:"100",termMonths:1});
  assert.equal(p.periods.length,1);
  assert.equal(p.periods[0].principalPaid,10);
  assert.equal(p.periods[0].interestPaid,0.83);
  assert.equal(p.periods[0].payment,10.83);
});

test("reject invalid principal, APR, months, dates and missing reference",()=>{
  for(const principal of ["", "-1", "0", "1.234", "1e4", "9,999.00", "9007199254740999.99","NaN"]){
    assert.throws(()=>run({principal}),/Principal/);
  }
  for(const annualRatePercent of ["", "-1", "1.00001", "101","1e2","100.0001", "Infinity"]){
    assert.throws(()=>run({annualRatePercent}),/Annual/);
  }
  for(const termMonths of [0,361,1.5,Infinity,NaN]){
    assert.throws(()=>run({termMonths}),/term/);
  }
  for(const firstPaymentDate of ["", "2026-02-29","2026/01/01","209-12-01"]){
    assert.throws(()=>run({firstPaymentDate}),/date/);
  }
  assert.throws(()=>run({loanReference:""}),/reference/);
  assert.throws(()=>run({principal:"0.01",termMonths:360}),/small/);
});

test("CSV neutralizes spreadsheet formulas and contains one row per period",()=>{
  const p=run({loanReference:'=SUM(1,2)\n"test"'});
  assert.match(p.csv,/"'=SUM\(1,2\)\n""test"""/);
  assert.equal(p.csv.split("\r\n").length-2,p.periods.length);
});

test("Accounting Web/Windows UI exposes repayment planner as a dedicated tab",()=>{
  const panel=fs.readFileSync(new URL("../../../ui/src/components/accounting/LoanRepaymentPanel.tsx",import.meta.url),"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountingPanel.tsx",import.meta.url),"utf8");
  assert.match(panel,/Preview loan repayments/);
  assert.match(panel,/Export loan schedule CSV/);
  assert.match(panel,/buildLoanRepaymentPlan/);
  assert.match(host,/tabButton\("loans", "Loans"\)/);
  assert.match(host,/<LoanRepaymentPanel \/>/);
});
